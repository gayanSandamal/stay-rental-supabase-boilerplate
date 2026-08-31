import { describe, expect, it } from 'vitest';
import {
  MIN_COMPARABLES_FOR_PERCENTILE,
  MIN_COMPARABLES_FOR_RENT,
  TREND_TOLERANCE_DAYS,
  computePercentile,
  computeRentComparison,
  pickMarketTrend,
  thinMarketNote,
} from '@/lib/analytics/comparables';

/**
 * Sample-size floors.
 *
 * "Beats 80% of similar listings" over four comparable homes is noise wearing
 * the costume of insight, and production had zero active listings and three
 * users as recently as 2026-08-27. Below the floor the answer is null, and the
 * caller is expected to say why rather than print a number.
 */

const rents = (n: number) => Array.from({ length: n }, (_, i) => 50_000 + i * 1_000);
const views = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('rent comparison floor', () => {
  it('returns null one comparable below the floor', () => {
    expect(computeRentComparison(60_000, rents(MIN_COMPARABLES_FOR_RENT - 1))).toBeNull();
  });

  it('returns a comparison exactly at the floor', () => {
    const result = computeRentComparison(60_000, rents(MIN_COMPARABLES_FOR_RENT));
    expect(result).not.toBeNull();
    expect(result!.similarCount).toBe(MIN_COMPARABLES_FOR_RENT);
  });

  it('never compares a listing against an empty market', () => {
    expect(computeRentComparison(60_000, [])).toBeNull();
  });

  it('reports position and percentage against the average of the others', () => {
    // avg of 100k and 200k is 150k; 120k is 20% below it.
    const result = computeRentComparison(120_000, [100_000, 200_000, 150_000]);
    expect(result).not.toBeNull();
    expect(result!.avgRent).toBe(150_000);
    expect(result!.position).toBe('below');
    expect(result!.pctBelowAbove).toBe(20);
    expect(result!.minRent).toBe(100_000);
    expect(result!.maxRent).toBe(200_000);
  });
});

describe('percentile floor', () => {
  it('returns null one sample below the floor', () => {
    expect(computePercentile(10, views(MIN_COMPARABLES_FOR_PERCENTILE - 1))).toBeNull();
  });

  it('returns a percentile exactly at the floor', () => {
    expect(computePercentile(10, views(MIN_COMPARABLES_FOR_PERCENTILE))).not.toBeNull();
  });

  /*
   * The reason the percentile floor is HIGHER than the rent floor: over three
   * samples a percentile can only ever be 0, 33, 67 or 100, so it reads as a
   * precise claim while carrying less information than the raw view count
   * printed next to it.
   */
  it('is stricter than the rent floor', () => {
    expect(MIN_COMPARABLES_FOR_PERCENTILE).toBeGreaterThan(MIN_COMPARABLES_FOR_RENT);
    expect(MIN_COMPARABLES_FOR_PERCENTILE).toBeGreaterThan(3);
  });

  it('ranks against listings with strictly fewer views', () => {
    // 5 listings, 3 of them below 10 → 60th percentile.
    expect(computePercentile(10, [1, 2, 3, 10, 40])).toBe(60);
  });
});

describe('thin-market explanation', () => {
  it('names the place, so the landlord knows why there is no number', () => {
    expect(thinMarketNote('Horana', 2)).toContain('Horana');
    expect(thinMarketNote('Horana', 2)).toContain('2BR');
    expect(thinMarketNote('Horana')).toContain('similar listings');
  });
});

/**
 * Market trend (migration 0047's read side).
 *
 * The whole value of the snapshot table is history, so the reader has to be
 * honest about not having any yet: silence is the correct output for the first
 * couple of months, and a thin week must never be allowed to speak.
 */
describe('market rent trend', () => {
  const NOW = new Date('2026-08-31T00:00:00Z');
  const day = (daysAgo: number) =>
    new Date(NOW.getTime() - daysAgo * 86400000).toISOString().slice(0, 10);
  const snap = (daysAgo: number, avgRent: number, sampleSize = 6) => ({
    avgRent,
    sampleSize,
    capturedOn: day(daysAgo),
  });

  it('says nothing until there is more than one reading', () => {
    expect(pickMarketTrend([], NOW)).toBeNull();
    expect(pickMarketTrend([snap(0, 120_000)], NOW)).toBeNull();
  });

  it('prefers the quarter over the month — a month is often one listing arriving', () => {
    const trend = pickMarketTrend(
      [snap(0, 118_000), snap(28, 110_000), snap(84, 100_000)],
      NOW
    );
    expect(trend).not.toBeNull();
    expect(trend!.weeksBack).toBe(12);
    expect(trend!.thenAvgRent).toBe(100_000);
    expect(trend!.pctChange).toBe(18);
  });

  it('falls back to the month when there is no quarter of history', () => {
    const trend = pickMarketTrend([snap(0, 110_000), snap(28, 100_000)], NOW);
    expect(trend!.weeksBack).toBe(4);
    expect(trend!.pctChange).toBe(10);
  });

  /*
   * sample_size is stored per snapshot for exactly this: a week when the market
   * was too thin to average would otherwise report an enormous "move" that is
   * really one expensive house arriving.
   */
  it('discards a reading taken when the market was too thin', () => {
    const thin = pickMarketTrend(
      [snap(0, 118_000), snap(84, 999_999, MIN_COMPARABLES_FOR_RENT - 1)],
      NOW
    );
    expect(thin).toBeNull();
  });

  it('discards a LATEST reading that is too thin, rather than comparing against it', () => {
    expect(
      pickMarketTrend(
        [snap(0, 999_999, MIN_COMPARABLES_FOR_RENT - 1), snap(84, 100_000)],
        NOW
      )
    ).toBeNull();
  });

  it('ignores a reading that is nowhere near either window', () => {
    // 50 days back is neither ~28 nor ~84, and the job runs weekly — a reading
    // that far off target is not the comparison anyone asked for.
    expect(pickMarketTrend([snap(0, 118_000), snap(50, 100_000)], NOW)).toBeNull();
  });

  it('tolerates a missed weekly run either side of the target', () => {
    const late = pickMarketTrend(
      [snap(0, 118_000), snap(84 + TREND_TOLERANCE_DAYS - 1, 100_000)],
      NOW
    );
    expect(late).not.toBeNull();
    expect(late!.weeksBack).toBe(12);
  });

  it('reports the weaker leg as the sample size', () => {
    const trend = pickMarketTrend([snap(0, 118_000, 9), snap(84, 100_000, 4)], NOW);
    expect(trend!.sampleSize).toBe(4);
  });

  it('signs a falling market negative', () => {
    const trend = pickMarketTrend([snap(0, 90_000), snap(84, 100_000)], NOW);
    expect(trend!.pctChange).toBe(-10);
  });
});
