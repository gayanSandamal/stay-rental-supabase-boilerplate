import { afterEach, describe, expect, it, vi } from 'vitest';
import { embeddedPostText, isTruncatedPreview } from '@/lib/imports/facebook/embedded';
import { resolvePost } from '@/lib/imports/facebook/resolve';

/** Shapes copied from a live group-post response, 2026-11-29. */
const FULL =
  '🏡 HOUSE FOR RENT – COLOMBO 5\n\n📍 Layards Road, Colombo 5\n\nFully furnished 3-bedroom house with attached bathrooms, maid’s room with attached bathroom, "powder room", kitchen.\n💰 Rent: Rs. 400,000 per month\n📞 Contact:\n070 125 6170 / 072 438 1763';
const PREVIEW = FULL.slice(0, 130) + '...';

const ascii = (s: string) =>
  JSON.stringify(s).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const message = (s: string) => `"message":{"delight_ranges":[],"ranges":[],"text":${ascii(s)}}`;
const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

function page(...texts: string[]) {
  return (
    `<html><head><meta property="og:title" content="${attr('House For Rent - Sri Lanka | 🏡 HOUSE FOR RENT – COLOMBO 5 | Facebook')}" />` +
    `<meta property="og:description" content="${attr(PREVIEW)}" /></head><body>` +
    // The real message sits ~500 KB in; the old reader stopped at 512 KB.
    `<script>${'x'.repeat(700_000)}</script>` +
    texts.map((t) => `<script type="application/json">{${message(t)}}</script>`).join('') +
    '</body></html>'
  );
}

describe('embeddedPostText', () => {
  it('recovers the whole post the preview cut off', () => {
    expect(embeddedPostText(page(FULL), PREVIEW)).toBe(FULL);
  });

  it('never returns another post on the same page, however long', () => {
    const other = 'A DIFFERENT ADVERT. '.repeat(60);
    expect(embeddedPostText(page(other), PREVIEW)).toBeNull();
    expect(embeddedPostText(page(other, FULL), PREVIEW)).toBe(FULL);
  });

  it('keeps the first match when a re-post shares its opening', () => {
    const repost = FULL.replace('400,000', '450,000') + ' extra extra extra';
    expect(embeddedPostText(page(FULL, repost), PREVIEW)).toBe(FULL);
  });

  it('replaces a shortened copy with the full one that continues it', () => {
    expect(embeddedPostText(page(FULL.slice(0, 160) + '…', FULL), PREVIEW)).toBe(FULL);
  });

  it('leaves a complete preview alone and refuses a weak one', () => {
    expect(embeddedPostText(page(FULL), FULL)).toBeNull();
    expect(embeddedPostText(page(FULL), '🏡 HOUSE...')).toBeNull();
    expect(isTruncatedPreview('cut off...')).toBe(true);
    expect(isTruncatedPreview('cut off…')).toBe(true);
    expect(isTruncatedPreview('whole.')).toBe(false);
  });
});

describe('resolvePost', () => {
  afterEach(() => vi.unstubAllGlobals());
  const serve = (html: string) =>
    vi.stubGlobal('fetch', async () => new Response(html, { headers: { 'content-type': 'text/html' } }));

  it('returns the full text with no "only a preview" note', async () => {
    serve(page(FULL));
    const post = await resolvePost('https://www.facebook.com/groups/renthouselk/posts/1776515486999577/');
    expect(post.resolvedVia).toBe('og');
    expect(post.text).toContain('400,000');
    expect(post.text).toContain('072 438 1763');
    expect(post.note).toBeNull();
  });

  it('falls back to the preview, and says so, when the body is missing', async () => {
    serve(page());
    const post = await resolvePost('https://www.facebook.com/groups/renthouselk/posts/1776515486999577/');
    expect(isTruncatedPreview(post.text)).toBe(true);
    expect(post.note).toMatch(/preview/);
  });
});
