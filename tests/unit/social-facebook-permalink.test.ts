import { describe, expect, it } from 'vitest';
import { normalizeFacebookPermalink } from '@/lib/social/adapters/facebook-page';

/**
 * The link Easy Rent sends a landlord after posting their listing.
 *
 * THE INCIDENT (2026-08-23, listing #26). A Page has TWO ids, and the one we
 * publish with is not the one its public URLs use:
 *
 *   FACEBOOK_PAGE_ID         1229347226919525   ← what Graph publishes with
 *   the Page's public actor   61591091318155    ← what facebook.com URLs use
 *
 * Graph hands back a post id as `{FACEBOOK_PAGE_ID}_{story-id}`, so every URL
 * we assembled locally carried the wrong id. Measured against the live post:
 *
 *   /1229347226919525_122111941959369710       → "Log into Facebook"
 *   /permalink.php?story_fbid=…&id=…           → "Log into Facebook"
 *   /1229347226919525/posts/122111941959369710 → renders on web via a redirect,
 *                                                but the mobile app cannot
 *                                                deep-link it → "This isn't
 *                                                available"
 *   /61591091318155/posts/…/122111941959369710/ → the post, everywhere
 *
 * The first attempt at this fix swapped the first form for the third, which
 * still failed on the app — because the id was still wrong, and a logged-out
 * web fetch had made it look correct. The actor id appears NOWHERE in our
 * configuration, so nothing local can build a valid URL. Only Graph's
 * `permalink_url` is authoritative, and when it is missing the honest answer
 * is no link at all.
 */

describe('normalizeFacebookPermalink', () => {
  const CANONICAL =
    'https://www.facebook.com/61591091318155/posts/-2-bedroom-apartment-for-rent-in-horana-kalutara-lkr-25000month-3-months-deposit/122111941959369710/';

  it('passes through the canonical URL Graph returns', () => {
    expect(normalizeFacebookPermalink(CANONICAL)).toBe(CANONICAL);
  });

  it('absolutizes a relative permalink_url', () => {
    // Graph returns a path rather than a full URL for some objects.
    expect(normalizeFacebookPermalink('/61591091318155/posts/122111941959369710/')).toBe(
      'https://www.facebook.com/61591091318155/posts/122111941959369710/'
    );
  });

  it.each([null, undefined, '', '   '])('returns null for %p rather than a guess', (raw) => {
    expect(normalizeFacebookPermalink(raw as string | null)).toBeNull();
  });

  it('rejects anything that is not a URL', () => {
    // A bare id is the shape that started this: it looks link-ish and is not.
    expect(normalizeFacebookPermalink('1229347226919525_122111941959369710')).toBeNull();
    expect(normalizeFacebookPermalink('javascript:alert(1)')).toBeNull();
  });

  it('THE REGRESSION: nothing here can manufacture a URL from a post id', () => {
    // The module must expose no way to build a permalink from the composite id.
    // Every such URL carries FACEBOOK_PAGE_ID, which public Facebook URLs do
    // not use, and the resulting link dies in the landlord's phone.
    const composite = '1229347226919525_122111941959369710';
    const out = normalizeFacebookPermalink(composite);
    expect(out).toBeNull();
    expect(out ?? '').not.toContain('1229347226919525');
  });
});
