import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Facebook link in "… is now on Easy Rent's social media".
 *
 * THE INCIDENT (2026-11-05, listing #47 "3BR House in Boralesgamuwa"). Graph's
 * `permalink_url` came back as
 *
 *   https://www.facebook.com/122111970747369710/posts/122122631871369710
 *
 * and the landlord could not open it on their phone. The lead id resolves to
 * nothing on facebook.com; every variant of the post URL names
 * `/61591091318155/posts/…/122122631871369710/` as canonical. In August the same
 * field returned that canonical form (social-facebook-permalink.test.ts), so
 * Meta changed what it returns — the fix keeps the story id and puts the
 * Page's PUBLIC id in front of it.
 */

const graphGet = vi.fn();
vi.mock('@/lib/social/adapters/graph', () => ({
  graphGet: (...args: unknown[]) => graphGet(...args),
}));

import {
  facebookPostUrl,
  facebookStoryId,
  parseFacebookPageRef,
  resetFacebookPageRefCache,
  resolveFacebookPublicPageRef,
  withFacebookPostUrl,
} from '@/lib/social/facebook-permalink';

const GRAPH_PAGE_ID = '1229347226919525';
const PUBLIC_ID = '61591091318155';
const BROKEN_LEAD_ID = '122111970747369710';
const STORY = '122122631871369710';
const REMOTE_POST_ID = `${GRAPH_PAGE_ID}_${STORY}`;
const STORED = `https://www.facebook.com/${BROKEN_LEAD_ID}/posts/${STORY}`;
const FIXED = `https://www.facebook.com/${PUBLIC_ID}/posts/${STORY}`;

describe('facebookPostUrl', () => {
  it('THE INCIDENT: rewrites the lead id Graph returned onto the public Page id', () => {
    expect(
      facebookPostUrl({ permalink: STORED, remotePostId: REMOTE_POST_ID, publicPageRef: PUBLIC_ID })
    ).toBe(FIXED);
  });

  it('keeps Facebook’s own canonical (slug and all) when it already leads with the public id', () => {
    const canonical = `https://www.facebook.com/${PUBLIC_ID}/posts/-3-bedroom-house-for-rent/${STORY}/`;
    expect(
      facebookPostUrl({ permalink: canonical, remotePostId: REMOTE_POST_ID, publicPageRef: PUBLIC_ID })
    ).toBe(canonical);
  });

  it('builds the link from the composite post id when Graph gave no permalink', () => {
    expect(
      facebookPostUrl({ permalink: null, remotePostId: REMOTE_POST_ID, publicPageRef: PUBLIC_ID })
    ).toBe(FIXED);
  });

  it('accepts a username as the public ref', () => {
    expect(
      facebookPostUrl({ permalink: STORED, remotePostId: REMOTE_POST_ID, publicPageRef: 'easyrent.lk' })
    ).toBe(`https://www.facebook.com/easyrent.lk/posts/${STORY}`);
  });

  it('with no public id, falls back to Graph’s permalink — never to one built on FACEBOOK_PAGE_ID', () => {
    const out = facebookPostUrl({ permalink: STORED, remotePostId: REMOTE_POST_ID, publicPageRef: null });
    expect(out).toBe(STORED);
    expect(out).not.toContain(GRAPH_PAGE_ID);
    expect(
      facebookPostUrl({ permalink: null, remotePostId: REMOTE_POST_ID, publicPageRef: null })
    ).toBeNull();
  });

  it('never produces the login-walled composite form', () => {
    for (const publicPageRef of [PUBLIC_ID, null]) {
      const out = facebookPostUrl({ permalink: STORED, remotePostId: REMOTE_POST_ID, publicPageRef }) ?? '';
      expect(out).not.toContain(`${GRAPH_PAGE_ID}_`);
      expect(out).not.toContain('permalink.php');
    }
  });

  it('a dry run gets no link, whatever else is known', () => {
    expect(
      facebookPostUrl({
        permalink: STORED,
        remotePostId: 'dryrun-facebook_page-47',
        publicPageRef: PUBLIC_ID,
      })
    ).toBeNull();
  });

  it('ignores a public ref that is not a Page id or username', () => {
    expect(
      facebookPostUrl({ permalink: STORED, remotePostId: REMOTE_POST_ID, publicPageRef: 'javascript:alert(1)' })
    ).toBe(STORED);
  });
});

describe('facebookStoryId', () => {
  it('prefers the composite post id', () => {
    expect(facebookStoryId(null, REMOTE_POST_ID)).toBe(STORY);
  });
  it.each([
    STORED,
    `https://www.facebook.com/${PUBLIC_ID}/posts/some-slug/${STORY}/`,
    `https://www.facebook.com/story.php?story_fbid=${STORY}&id=${BROKEN_LEAD_ID}`,
    `/${BROKEN_LEAD_ID}/posts/${STORY}`,
  ])('reads it out of %s', (url) => {
    expect(facebookStoryId(url, null)).toBe(STORY);
  });
  it('returns null when there is nothing to read', () => {
    expect(facebookStoryId(null, 'dryrun-facebook_page-47')).toBeNull();
    expect(facebookStoryId('https://www.facebook.com/x', null)).toBeNull();
  });
});

describe('parseFacebookPageRef', () => {
  it.each([
    [PUBLIC_ID, PUBLIC_ID],
    [`https://www.facebook.com/${PUBLIC_ID}`, PUBLIC_ID],
    [`https://www.facebook.com/p/Easy-Rent-${PUBLIC_ID}/`, PUBLIC_ID],
    [`https://www.facebook.com/profile.php?id=${PUBLIC_ID}`, PUBLIC_ID],
    [`https://m.facebook.com/pages/Easy-Rent/${PUBLIC_ID}`, PUBLIC_ID],
    ['https://www.facebook.com/easyrent.lk/', 'easyrent.lk'],
  ])('%s → %s', (raw, expected) => {
    expect(parseFacebookPageRef(raw)).toBe(expected);
  });

  it.each([
    null,
    '',
    'https://evil.example/61591091318155',
    'https://facebook.com.evil.com/61591091318155',
    'https://www.facebook.com/groups/123456789',
    'https://www.facebook.com/profile.php',
    'https://www.facebook.com/61591091318155/posts/1',
    'abc',
  ])('rejects %p', (raw) => {
    expect(parseFacebookPageRef(raw as string | null)).toBeNull();
  });
});

describe('withFacebookPostUrl (read-time repair of stored rows)', () => {
  const row = {
    id: 47,
    platform: 'facebook_page',
    remotePostId: REMOTE_POST_ID,
    remotePermalink: STORED,
  };

  it('repairs a row stored before the fix', () => {
    expect(withFacebookPostUrl(row, PUBLIC_ID).remotePermalink).toBe(FIXED);
  });

  it('returns the same object when there is nothing to change', () => {
    expect(withFacebookPostUrl(row, null)).toBe(row);
    const ig = { ...row, platform: 'instagram', remotePermalink: 'https://www.instagram.com/p/DfVMcsWEp9C/' };
    expect(withFacebookPostUrl(ig, PUBLIC_ID)).toBe(ig);
  });
});

describe('resolveFacebookPublicPageRef', () => {
  const env = { ...process.env };

  beforeEach(() => {
    resetFacebookPageRefCache();
    graphGet.mockReset();
    process.env.FACEBOOK_PAGE_ID = GRAPH_PAGE_ID;
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = 'test-token';
    delete process.env.FACEBOOK_PAGE_PUBLIC_ID;
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it('uses FACEBOOK_PAGE_PUBLIC_ID without asking Graph', async () => {
    process.env.FACEBOOK_PAGE_PUBLIC_ID = PUBLIC_ID;
    expect(await resolveFacebookPublicPageRef({ network: true })).toBe(PUBLIC_ID);
    expect(graphGet).not.toHaveBeenCalled();
  });

  it('a render (no network) never calls Graph', async () => {
    expect(await resolveFacebookPublicPageRef()).toBeNull();
    expect(graphGet).not.toHaveBeenCalled();
  });

  it('asks Graph for the Page link from a cron, and caches the answer', async () => {
    graphGet.mockResolvedValue({ ok: true, data: { link: `https://www.facebook.com/p/Easy-Rent-${PUBLIC_ID}/` } });
    expect(await resolveFacebookPublicPageRef({ network: true })).toBe(PUBLIC_ID);
    expect(graphGet).toHaveBeenCalledWith(GRAPH_PAGE_ID, { fields: 'link' });
    // A later render on the same instance benefits without a call.
    expect(await resolveFacebookPublicPageRef()).toBe(PUBLIC_ID);
    expect(graphGet).toHaveBeenCalledTimes(1);
  });

  it('refuses a link that only repeats FACEBOOK_PAGE_ID', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    graphGet.mockResolvedValue({ ok: true, data: { link: `https://www.facebook.com/${GRAPH_PAGE_ID}` } });
    expect(await resolveFacebookPublicPageRef({ network: true })).toBeNull();
    spy.mockRestore();
  });

  it('a Graph failure is no answer, not an exception — and is not retried every call', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    graphGet.mockResolvedValue({ ok: false, error: { message: 'boom' } });
    expect(await resolveFacebookPublicPageRef({ network: true })).toBeNull();
    expect(await resolveFacebookPublicPageRef({ network: true })).toBeNull();
    expect(graphGet).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('does not call Graph when the Page is not configured (dry run)', async () => {
    delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    expect(await resolveFacebookPublicPageRef({ network: true })).toBeNull();
    expect(graphGet).not.toHaveBeenCalled();
  });
});
