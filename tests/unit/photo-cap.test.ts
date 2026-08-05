import { describe, expect, it } from 'vitest';
import { capHeadroom, capPhotos, capRejectEntries } from '@/lib/images/cap';

/** The arithmetic behind the per-listing photo cap. No flags, no I/O. */

const urls = (n: number) => Array.from({ length: n }, (_, i) => `https://x/p${i + 1}.jpg`);

describe('capPhotos', () => {
  it('keeps the first N in order and reports the rest', () => {
    const { kept, dropped } = capPhotos(urls(8), 6);
    expect(kept).toEqual(urls(8).slice(0, 6));
    expect(dropped).toEqual(urls(8).slice(6));
  });

  it('passes everything through when under the cap', () => {
    const { kept, dropped } = capPhotos(urls(3), 6);
    expect(kept).toEqual(urls(3));
    expect(dropped).toEqual([]);
  });

  it('treats exactly-at-cap as no drop', () => {
    expect(capPhotos(urls(6), 6).dropped).toEqual([]);
  });

  it('fails soft on a nonsensical cap rather than blanking the gallery', () => {
    // A mistyped 0 in Back Office must never delete every photo on the site.
    for (const cap of [0, -1, NaN, Infinity]) {
      const { kept, dropped } = capPhotos(urls(8), cap);
      expect(kept).toEqual(urls(8));
      expect(dropped).toEqual([]);
    }
  });

  it('handles an empty submission', () => {
    expect(capPhotos([], 6)).toEqual({ kept: [], dropped: [] });
  });
});

describe('capHeadroom', () => {
  it('reports remaining slots', () => {
    expect(capHeadroom(0, 6)).toBe(6);
    expect(capHeadroom(4, 6)).toBe(2);
    expect(capHeadroom(6, 6)).toBe(0);
  });

  it('never goes negative for an already-over-cap listing', () => {
    // Lowering the cap must not produce a negative slice length.
    expect(capHeadroom(8, 6)).toBe(0);
  });

  it('is effectively unlimited when the cap is off', () => {
    expect(capHeadroom(100, 0)).toBeGreaterThan(1000);
    expect(capHeadroom(100, Infinity)).toBeGreaterThan(1000);
  });
});

describe('capRejectEntries', () => {
  it('marks refused photos cosmetic, unpublished, and explains why', () => {
    const entries = capRejectEntries(urls(2), 6);
    expect(entries).toHaveLength(2);
    for (const e of entries) {
      expect(e.v).toBe('reject');
      expect(e.sev).toBe('cosmetic');
      expect(e.p).toBeNull();
      expect(e.r).toContain('6');
    }
  });

  it('keeps the original URL so ops can still swap one in', () => {
    expect(capRejectEntries([urls(1)[0]], 6)[0].o).toBe(urls(1)[0]);
  });
});
