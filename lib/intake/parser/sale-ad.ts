/**
 * Is this ad selling a property rather than letting one?
 *
 * Easy Rent is a rental marketplace, so a for-sale ad has no monthly rent by
 * definition. Without this, the pipeline asks for one, the landlord has no
 * answer to give, and the conversation loops forever — which is exactly what
 * happened to intake #28: a Sinhala ad reading "ගැනුම්කරුවන් පමණක් කතා කිරීමට
 * කරුණික වන්න" (buyers only) with clear freehold deeds and a 30-perch land
 * extent, met with "we still need: the monthly rent".
 *
 * A SIGNAL, NOT A VERDICT. Two guards keep it off genuine rentals:
 *
 *  1. It is only consulted when the rent is ABSENT. An ad that states a monthly
 *     rent is a rental, whatever else it mentions.
 *  2. It needs TWO markers. Sri Lankan rental ads routinely quote the land
 *     extent in perches and mention deeds, and either alone must not divert a
 *     real landlord into a "we don't do sales" reply.
 *
 * Pure and I/O-free, in the spirit of `scam.ts` next door.
 */

/**
 * Markers, deliberately narrow. `ඔප්පු` (deeds) and `පර්චස්` (perches) are the
 * weakest — common enough in rental ads that they only ever count toward the
 * two-marker threshold, never alone.
 */
const SALE_MARKERS: Array<{ id: string; re: RegExp }> = [
  // --- Sinhala -------------------------------------------------------------
  { id: 'si.buyers', re: /ගැනුම්කරු/u }, // buyer(s)
  { id: 'si.forSale', re: /විකිණීමට|විකුණ/u }, // for sale / to sell
  { id: 'si.freehold', re: /සින්නක්කර/u }, // freehold
  { id: 'si.deeds', re: /ඔප්පු/u }, // deeds
  { id: 'si.perches', re: /පර්චස්/u }, // perches
  // --- Tamil ---------------------------------------------------------------
  { id: 'ta.forSale', re: /விற்பனை|விற்க/u },
  { id: 'ta.buyers', re: /வாங்குபவ/u },
  { id: 'ta.deeds', re: /பத்திரம்/u },
  // --- English / romanized -------------------------------------------------
  { id: 'en.forSale', re: /\bfor\s+sale\b|\bselling\b/i },
  { id: 'en.buyers', re: /\bbuyers?\s+only\b|\bgenuine\s+buyers?\b/i },
  { id: 'en.freehold', re: /\bfreehold\b|\bclear\s+deed/i },
  { id: 'en.deed', re: /\bdeeds?\b|\btitle\s+deed\b/i },
  { id: 'en.perches', re: /\bperch(?:es)?\b/i },
];

/** Markers strong enough that the ad is about a sale even standing near a rental word. */
const STRONG = new Set(['si.buyers', 'si.forSale', 'ta.forSale', 'ta.buyers', 'en.forSale', 'en.buyers']);

/** How many markers must hit before we call it. */
const THRESHOLD = 2;

export interface SaleAdSignal {
  /** Treat this as a for-sale ad. */
  looksLikeSale: boolean;
  /** Which markers fired — recorded for ops, so the rule can be tuned on evidence. */
  markers: string[];
}

/**
 * `hasRent` is the caller's parsed rent. Passing it in — rather than
 * re-detecting here — keeps this function honest about being a tiebreaker for
 * ads the parser could not price.
 */
export function detectSaleAd(text: string, hasRent: boolean): SaleAdSignal {
  // A stated monthly rent settles it. Nothing below can override that.
  if (hasRent) return { looksLikeSale: false, markers: [] };

  const body = text ?? '';
  const markers = SALE_MARKERS.filter((m) => m.re.test(body)).map((m) => m.id);

  // Two of anything, or one strong marker alongside any other — "buyers only"
  // is about as explicit as an ad gets.
  const strongHits = markers.filter((m) => STRONG.has(m)).length;
  const looksLikeSale = markers.length >= THRESHOLD && strongHits >= 1;

  return { looksLikeSale, markers };
}

/** Stored on the intake so ops can see how often this fires. */
export const SALE_AD_REASON = 'Looks like a sale ad, not a rental';
