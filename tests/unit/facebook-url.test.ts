import { describe, expect, it } from 'vitest';
import {
  graphPostId,
  isAllowedFacebookHost,
  parseFacebookUrl,
} from '@/lib/imports/facebook/url';

/**
 * `parseFacebookUrl` is the SSRF guard for the whole importer: an operator
 * pastes a string and the SERVER dereferences it, so anything this function
 * accepts is a request we will make from inside our own network. These tests
 * are about what it REFUSES first and what it parses second.
 */

describe('host allowlist', () => {
  it('refuses a lookalike host', () => {
    // The reason the allowlist is a Set of exact hosts and not endsWith().
    expect(parseFacebookUrl('https://facebook.com.evil.com/groups/1/posts/2')).toBeNull();
    expect(isAllowedFacebookHost('facebook.com.evil.com')).toBe(false);
  });

  it('refuses an unrelated host', () => {
    expect(parseFacebookUrl('https://evil.com/groups/1/posts/2')).toBeNull();
  });

  it('refuses the cloud metadata endpoint and other IP literals', () => {
    expect(parseFacebookUrl('http://169.254.169.254/latest/meta-data/')).toBeNull();
    expect(parseFacebookUrl('http://127.0.0.1:3000/api/user')).toBeNull();
    expect(parseFacebookUrl('http://[::1]/')).toBeNull();
  });

  it('refuses non-http schemes', () => {
    expect(parseFacebookUrl('file:///etc/passwd')).toBeNull();
    expect(parseFacebookUrl('gopher://facebook.com/')).toBeNull();
    expect(parseFacebookUrl('javascript:alert(1)')).toBeNull();
  });

  it('refuses credentials in the authority', () => {
    // Parsers disagree about whether the host here is facebook.com or evil.com.
    // An ambiguity in an SSRF guard is a failure, so it is refused outright.
    expect(parseFacebookUrl('https://www.facebook.com@evil.com/groups/1/posts/2')).toBeNull();
  });

  it('refuses junk', () => {
    expect(parseFacebookUrl('')).toBeNull();
    expect(parseFacebookUrl('not a url')).toBeNull();
    expect(parseFacebookUrl('   ')).toBeNull();
  });

  it('accepts the Facebook hosts landlords actually paste', () => {
    for (const host of ['www.facebook.com', 'm.facebook.com', 'web.facebook.com', 'fb.com']) {
      expect(isAllowedFacebookHost(host)).toBe(true);
      expect(parseFacebookUrl(`https://${host}/groups/123/posts/456`)).not.toBeNull();
    }
  });

  it('is case-insensitive about the host', () => {
    expect(parseFacebookUrl('https://WWW.Facebook.COM/groups/1/posts/2')).not.toBeNull();
  });
});

describe('classification', () => {
  it('reads a group post', () => {
    const parsed = parseFacebookUrl('https://www.facebook.com/groups/998877/posts/12345/');
    expect(parsed).toMatchObject({ kind: 'group_post', groupId: '998877', postId: '12345' });
  });

  it('reads a group permalink', () => {
    const parsed = parseFacebookUrl('https://www.facebook.com/groups/998877/permalink/12345/');
    expect(parsed).toMatchObject({ kind: 'group_post', groupId: '998877', postId: '12345' });
  });

  it('reads a page post', () => {
    const parsed = parseFacebookUrl('https://www.facebook.com/EasyRentLK/posts/778899');
    expect(parsed).toMatchObject({ kind: 'page_post', pageId: 'EasyRentLK', postId: '778899' });
  });

  it('reads permalink.php', () => {
    const parsed = parseFacebookUrl(
      'https://www.facebook.com/permalink.php?story_fbid=778899&id=1122'
    );
    expect(parsed).toMatchObject({ kind: 'page_post', pageId: '1122', postId: '778899' });
  });

  it('reads a photo post', () => {
    const parsed = parseFacebookUrl('https://www.facebook.com/photo/?fbid=4455&set=a.1');
    expect(parsed).toMatchObject({ kind: 'photo', postId: '4455' });
  });

  it('keeps an opaque share link rather than discarding it', () => {
    // /share/p/… is real; it only resolves once fetched. Refusing it would
    // reject the link Facebook's own share button produces.
    const parsed = parseFacebookUrl('https://www.facebook.com/share/p/AbCdEf/');
    expect(parsed?.kind).toBe('unknown');
  });

  it('strips tracking query strings from the canonical URL', () => {
    const parsed = parseFacebookUrl(
      'https://www.facebook.com/groups/1/posts/2?ref=share&mibextid=abc'
    );
    expect(parsed?.canonicalUrl).toBe('https://www.facebook.com/groups/1/posts/2');
  });
});

describe('graphPostId', () => {
  it('builds pageId_postId for a numeric page post', () => {
    const parsed = parseFacebookUrl('https://www.facebook.com/permalink.php?story_fbid=99&id=11');
    expect(graphPostId(parsed!)).toBe('11_99');
  });

  it('refuses a group post — there is no Graph read for one', () => {
    const parsed = parseFacebookUrl('https://www.facebook.com/groups/1/posts/2');
    expect(graphPostId(parsed!)).toBeNull();
  });
});

describe('OpenGraph extraction', () => {
  it('strips the "| Facebook" suffix Facebook appends to og:title', async () => {
    // Left in, it becomes part of the listing title someone has to delete by
    // hand. Verified against a live post: "…RATMALANA | Facebook".
    const { __test } = await import('@/lib/imports/facebook/fetch');
    expect(__test.stripSiteSuffix('BRAND NEW APARTMENT – RATMALANA | Facebook')).toBe(
      'BRAND NEW APARTMENT – RATMALANA'
    );
    expect(__test.stripSiteSuffix('House in Kandy - Facebook')).toBe('House in Kandy');
    expect(__test.stripSiteSuffix('A place | Facebook Marketplace')).toBe(
      'A place | Facebook Marketplace'
    );
    expect(__test.stripSiteSuffix(null)).toBeNull();
  });

  it('collects every og:image in document order, deduped', async () => {
    const { __test } = await import('@/lib/imports/facebook/fetch');
    const html = `
      <meta property="og:image" content="https://cdn/a.jpg">
      <meta content="https://cdn/b.jpg" property="og:image">
      <meta property="og:image:width" content="1200">
      <meta property="og:image" content="https://cdn/a.jpg">
    `;
    // Order preserved across both attribute orders; og:image:width not matched;
    // the repeat dropped.
    expect(__test.metaContentAll(html, 'og:image')).toEqual([
      'https://cdn/a.jpg',
      'https://cdn/b.jpg',
    ]);
  });

  it('decodes the entities Facebook CDN URLs are full of', async () => {
    const { __test } = await import('@/lib/imports/facebook/fetch');
    const html = `<meta property="og:image" content="https://cdn/x.jpg?a=1&amp;b=2">`;
    expect(__test.metaContentAll(html, 'og:image')).toEqual(['https://cdn/x.jpg?a=1&b=2']);
  });
});
