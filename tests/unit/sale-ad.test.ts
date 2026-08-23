import { describe, expect, it } from 'vitest';
import { detectSaleAd } from '@/lib/intake/parser/sale-ad';

/**
 * Easy Rent is a rental marketplace, so a for-sale ad has no monthly rent to
 * give us. Without this signal the pipeline asks for one forever.
 *
 * The risk runs the other way too: Sri Lankan RENTAL ads routinely quote the
 * land extent in perches and mention deeds. Diverting one of those into a
 * "we don't do sales" reply would lose a real listing, so the false-positive
 * cases below matter as much as the true one.
 */

/** The real text of intake #28, verbatim. */
const REAL_SALE_AD = `💥  හොරණ නගරයට ආසන්නව වට්නා නිවසක් බදු දීමට ඇත.
💥  පර්චස් 30 යි
💥  නිදන කාමර 3 යි  නාන කාමර 2 යි සාලය කෑම කාමරය මුලුතැන්ගෙය.
💥  සින්නක්කර නිරවුල් ඔප්පු  ( coc ) ලබාගෙන ඇත.
💥  ගැනුම්කරුවන් පමණක් කතා කිරීමට කරුණික වන්න.
💥  විස්‍තර 0770253815  ගයාන්`;

describe('detectSaleAd', () => {
  it('fires on the real ad that caused this', () => {
    const { looksLikeSale, markers } = detectSaleAd(REAL_SALE_AD, false);
    expect(looksLikeSale).toBe(true);
    // "buyers only" is the decisive one; deeds/freehold/perches corroborate.
    expect(markers).toContain('si.buyers');
    expect(markers).toContain('si.freehold');
  });

  it('never fires when a monthly rent was parsed', () => {
    // A stated rent settles it, whatever else the ad says. This is the guard
    // that stops a chatty rental ad being refused.
    expect(detectSaleAd(REAL_SALE_AD, true).looksLikeSale).toBe(false);
  });

  it('does not fire on a Sinhala RENTAL ad that mentions perches and deeds', () => {
    const rental = `කුලියට දීමට නිවසක්. පර්චස් 20 යි. ඔප්පු ඇත. නිදන කාමර 3 යි.`;
    const { looksLikeSale } = detectSaleAd(rental, false);
    // Two weak markers, no strong one — not enough.
    expect(looksLikeSale).toBe(false);
  });

  it('does not fire on one marker alone', () => {
    expect(detectSaleAd('House for rent, 15 perches', false).looksLikeSale).toBe(false);
    expect(detectSaleAd('නිවසක් කුලියට. ඔප්පු ඇත.', false).looksLikeSale).toBe(false);
  });

  it('fires on an explicit English sale ad', () => {
    const { looksLikeSale } = detectSaleAd(
      'Land for sale in Kandy, 20 perches, clear deed, genuine buyers only',
      false
    );
    expect(looksLikeSale).toBe(true);
  });

  it('fires on a Tamil sale ad', () => {
    const { looksLikeSale } = detectSaleAd(
      'கொழும்பில் வீடு விற்பனைக்கு. பத்திரம் தெளிவாக உள்ளது.',
      false
    );
    expect(looksLikeSale).toBe(true);
  });

  it('is quiet on an ordinary rental ad', () => {
    const { looksLikeSale, markers } = detectSaleAd(
      'A house for rent at Ganemulla, 2 bedrooms 1 bathroom, WIFI and Solar',
      false
    );
    expect(looksLikeSale).toBe(false);
    expect(markers).toEqual([]);
  });

  it('is quiet on empty input', () => {
    expect(detectSaleAd('', false).looksLikeSale).toBe(false);
  });
});
