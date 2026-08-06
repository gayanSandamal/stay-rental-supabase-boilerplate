import { describe, expect, it } from 'vitest';
import { capHeadroom, capPhotos, capReason, capRejectEntries, photoCap } from '@/lib/images/cap';
import { derivePhotos } from '@/lib/images/manifest';

const urls = (n: number) => Array.from({ length: n }, (_, i) => `https://x/p${i}.jpg`);

describe('photoCap', () => {
  it('reads the code default when no override is loaded', () => {
    expect(photoCap()).toBe(6);
  });
});

describe('capPhotos', () => {
  it('keeps the first N in order and reports the rest', () => {
    const { kept, dropped } = capPhotos(urls(8), 6);
    expect(kept).toEqual(urls(8).slice(0, 6));
    expect(dropped).toEqual(urls(8).slice(6));
  });

  it('is a no-op under the cap', () => {
    expect(capPhotos(urls(3), 6)).toEqual({ kept: urls(3), dropped: [] });
  });

  // A cap of 0 reaching this function must not blank the gallery — photoCap()
  // maps non-positive values to Infinity, and this is the backstop.
  it('treats Infinity as no cap', () => {
    const { kept, dropped } = capPhotos(urls(50), Infinity);
    expect(kept).toHaveLength(50);
    expect(dropped).toEqual([]);
  });
});

describe('capHeadroom', () => {
  it('reports remaining slots and never goes negative', () => {
    expect(capHeadroom(4, 6)).toBe(2);
    expect(capHeadroom(6, 6)).toBe(0);
    expect(capHeadroom(8, 6)).toBe(0);
    expect(capHeadroom(99, Infinity)).toBe(Infinity);
  });
});

describe('capRejectEntries', () => {
  it('records over-cap photos as cosmetic rejects that name the limit', () => {
    const entries = capRejectEntries(urls(2), 6);
    expect(entries).toHaveLength(2);
    for (const e of entries) {
      expect(e).toMatchObject({ v: 'reject', sev: 'cosmetic', p: null });
      expect(e.r).toBe(capReason(6));
      expect(e.r).toContain('6');
    }
  });

  // reject + p:null means they never reach the public array, but the original
  // URL stays recorded so ops can restore one and the purge job collects it.
  it('keeps them out of the published photos', () => {
    expect(derivePhotos(capRejectEntries(urls(3), 6))).toEqual([]);
  });
});
