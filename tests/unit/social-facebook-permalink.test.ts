import { describe, expect, it } from 'vitest';
import { facebookPostUrl } from '@/lib/social/adapters/facebook-page';

/**
 * The link Easy Rent sends a landlord after posting their listing.
 *
 * THE INCIDENT (2026-08-23, listing #26). The adapter built the permalink by
 * dropping the Graph post id straight after the domain:
 *
 *   https://www.facebook.com/1229347226919525_122111941959369710
 *
 * Graph returns the post id as `{page-id}_{story-id}`, and that URL LOOKS like
 * it works, because a logged-in desktop browser follows Facebook's redirect.
 * It is not a post URL. Fetched without a session it lands on a login wall,
 * and the Facebook mobile app — which cannot deep-link the composite form —
 * shows "This isn't available". Verified against the live post:
 *
 *   /1229347226919525_122111941959369710  → <title>Log into Facebook</title>
 *   /1229347226919525/posts/122111941959369710
 *       → <title>Easy Rent - 🏠 2-bedroom apartment for rent in Horana…</title>
 *
 * The message this link goes in says "share it with anyone who might be
 * interested". A link that demands a login is not shareable, so this was a
 * distribution bug, not a cosmetic one.
 *
 * The adapter now asks Graph for `permalink_url` and only falls back to this
 * builder — but the fallback is what runs whenever that extra call fails, so
 * it has to be right on its own.
 */

/** The real ids from listing #26's Facebook post. */
const PAGE_ID = '1229347226919525';
const STORY_ID = '122111941959369710';

describe('facebookPostUrl', () => {
  it('THE REGRESSION: builds the public /posts/ form, not the composite id', () => {
    expect(facebookPostUrl(`${PAGE_ID}_${STORY_ID}`)).toBe(
      `https://www.facebook.com/${PAGE_ID}/posts/${STORY_ID}`
    );
  });

  it('never emits the login-walled composite form', () => {
    const url = facebookPostUrl(`${PAGE_ID}_${STORY_ID}`)!;
    expect(url).not.toContain(`${PAGE_ID}_${STORY_ID}`);
    expect(url).toContain('/posts/');
  });

  it('returns null rather than a broken URL for an unexpected id shape', () => {
    // A guessed URL is worse than no URL: the back office renders the
    // permalink as a link ops are told to open and delete by hand.
    expect(facebookPostUrl('1229347226919525')).toBeNull();
    expect(facebookPostUrl('')).toBeNull();
    expect(facebookPostUrl('_122111941959369710')).toBeNull();
    expect(facebookPostUrl('1229347226919525_')).toBeNull();
  });

  it('ignores anything after a second underscore', () => {
    // Graph ids are two-part; be explicit about what happens if that changes
    // rather than silently splicing extra segments into the path.
    expect(facebookPostUrl('123_456_789')).toBe('https://www.facebook.com/123/posts/456');
  });
});
