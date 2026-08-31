/**
 * How many comparable listings a market statistic needs before it is allowed
 * to be a number.
 *
 * "Beats 80% of similar listings" computed against four comparable homes is
 * noise wearing the costume of insight. As of 2026-08-27 production had zero
 * active listings and three users, so every comparative statistic on the
 * platform — market average rent, the percentile, "beats X% of similar
 * listings" — is being computed over a sample that cannot support it.
 *
 * ONE module, so there is one threshold rather than three drifting copies.
 *
 * Below the floor the caller must say so plainly ("Not enough similar listings
 * in Horana yet to compare"), not print a number and not silently drop the row:
 * a landlord who notices a statistic quietly disappearing trusts the remaining
 * ones less, not more.
 */

/**
 * Rent comparison (average rent for the same city + bedroom count).
 * Three is the smallest sample where an average is not simply "the other guy".
 */
export const MIN_COMPARABLES_FOR_RENT = 3;

/**
 * Percentile ("beats X% of similar listings").
 *
 * Higher than the rent floor on purpose: a percentile over 3 samples can only
 * ever return 0, 33, 67 or 100, so it reads as a precise claim while carrying
 * less information than the raw view count next to it.
 */
export const MIN_COMPARABLES_FOR_PERCENTILE = 5;

/**
 * How far the market must have moved before saying so is news.
 *
 * Under a few percent, "the market moved and you didn't" is describing sampling
 * noise in a country-sized dataset of a few dozen homes. Reporting it teaches
 * landlords to ignore the line that matters when the market really does move.
 */
export const MIN_MARKET_MOVE_PCT = 3;

/** Plain-language stand-in for a statistic we do not have the sample for. */
export function thinMarketNote(city: string, bedrooms?: number): string {
  const what = bedrooms === undefined ? 'similar listings' : `${bedrooms}BR listings`;
  return `Not enough ${what} in ${city} yet to compare`;
}

export type RentComparison = {
  yourRent: number;
  avgRent: number;
  minRent: number;
  maxRent: number;
  similarCount: number;
  position: 'below' | 'at' | 'above';
  pctBelowAbove: number;
};

/**
 * Average rent for the same city + bedroom count, or NULL when there are not
 * enough comparable listings for an average to mean anything.
 *
 * `otherRents` must EXCLUDE the listing being described — comparing a rent
 * against a set that contains it drags the average toward the answer.
 */
export function computeRentComparison(
  yourRent: number,
  otherRents: number[]
): RentComparison | null {
  if (otherRents.length < MIN_COMPARABLES_FOR_RENT) return null;

  const avgRent = Math.round(otherRents.reduce((a, b) => a + b, 0) / otherRents.length);
  const pct =
    yourRent < avgRent
      ? (1 - yourRent / avgRent) * 100
      : yourRent > avgRent
      ? (yourRent / avgRent - 1) * 100
      : 0;

  return {
    yourRent,
    avgRent,
    minRent: Math.min(...otherRents),
    maxRent: Math.max(...otherRents),
    similarCount: otherRents.length,
    position: yourRent < avgRent ? 'below' : yourRent > avgRent ? 'above' : 'at',
    pctBelowAbove: Math.round(pct),
  };
}

/**
 * "Beats X% of similar listings", or NULL below the floor.
 *
 * `marketViewCounts` is the whole active market for the listing's (city,
 * bedrooms) pair, the listing itself INCLUDED — that is the population the
 * claim is about, and excluding the subject would let a listing outrank itself.
 */
export function computePercentile(
  totalViews: number,
  marketViewCounts: number[]
): number | null {
  if (marketViewCounts.length < MIN_COMPARABLES_FOR_PERCENTILE) return null;
  const rank = marketViewCounts.filter((count) => count < totalViews).length;
  return Math.round((rank / marketViewCounts.length) * 100);
}

export type MarketRentTrend = {
  /** How far back the comparison reading was taken. */
  weeksBack: number;
  thenAvgRent: number;
  nowAvgRent: number;
  /** Signed percentage move of the MARKET, not of this listing. */
  pctChange: number;
  /** The smaller of the two readings' sample sizes — the weaker leg. */
  sampleSize: number;
  capturedOn: string;
};

export const TREND_WINDOWS_WEEKS = [12, 4];
export const TREND_TOLERANCE_DAYS = 10;

/**
 * The longest-horizon trend the history actually supports.
 *
 * Twelve weeks is preferred over four: a quarter is a market move, a month is
 * often a listing or two arriving. Each window accepts a reading within
 * TREND_TOLERANCE_DAYS of the target, because the job runs weekly and can miss
 * a run. Both legs must clear MIN_COMPARABLES_FOR_RENT — the sample size is
 * stored per snapshot precisely so a thin week can be discarded afterwards.
 */
export function pickMarketTrend(
  snapshots: { avgRent: number; sampleSize: number; capturedOn: string }[],
  now: Date
): MarketRentTrend | null {
  if (snapshots.length < 2) return null;

  // Ordered newest-first by the query.
  const latest = snapshots[0];
  if (latest.sampleSize < MIN_COMPARABLES_FOR_RENT) return null;

  for (const weeks of TREND_WINDOWS_WEEKS) {
    const target = new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);
    let best: (typeof snapshots)[number] | null = null;
    let bestGap = Infinity;

    for (const snapshot of snapshots) {
      if (snapshot === latest) continue;
      if (snapshot.sampleSize < MIN_COMPARABLES_FOR_RENT) continue;
      const gapDays =
        Math.abs(new Date(`${snapshot.capturedOn}T00:00:00Z`).getTime() - target.getTime()) /
        (24 * 60 * 60 * 1000);
      if (gapDays <= TREND_TOLERANCE_DAYS && gapDays < bestGap) {
        best = snapshot;
        bestGap = gapDays;
      }
    }

    if (best && best.avgRent > 0) {
      return {
        weeksBack: weeks,
        thenAvgRent: best.avgRent,
        nowAvgRent: latest.avgRent,
        pctChange: Math.round(((latest.avgRent - best.avgRent) / best.avgRent) * 100),
        sampleSize: Math.min(best.sampleSize, latest.sampleSize),
        capturedOn: best.capturedOn,
      };
    }
  }

  return null;
}
