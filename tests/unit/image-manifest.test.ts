import { describe, expect, it } from 'vitest';
import {
  parseManifest,
  serializeManifest,
  parsePhotos,
  manifestFromLegacyPhotos,
  derivePhotos,
  reconcileManifest,
  appendQueued,
  pendingEntries,
  isWhatsAppUrl,
} from '@/lib/images/manifest';
import type { PhotoManifestEntry } from '@/lib/images/types';

const SB = 'https://abc.supabase.co/storage/v1/object/public/property-images';
const orig = (n: string) => `${SB}/listings/${n}.jpg`;
const waOrig = (n: string) => `${SB}/whatsapp-intake/${n}.jpg`;
const derived = (n: string) => `${SB}/public/7/${n}-w.webp`;

describe('parseManifest / serializeManifest', () => {
  it('round-trips entries', () => {
    const entries: PhotoManifestEntry[] = [{ o: orig('a'), p: derived('aa'), h: 'h1', v: 'pass' }];
    expect(parseManifest(serializeManifest(entries))).toEqual(entries);
  });

  it('is forgiving about junk', () => {
    expect(parseManifest(null)).toEqual([]);
    expect(parseManifest('')).toEqual([]);
    expect(parseManifest('not json')).toEqual([]);
    expect(parseManifest('{"o":"x"}')).toEqual([]); // object, not array
    expect(parseManifest('[null,{"nope":1}]')).toEqual([]); // entries need `o`
  });

  it('serializes empty to null so the column stays NULL', () => {
    expect(serializeManifest([])).toBeNull();
  });
});

describe('parsePhotos', () => {
  it('handles the text column, arrays and junk', () => {
    expect(parsePhotos(JSON.stringify([orig('a'), orig('b')]))).toEqual([orig('a'), orig('b')]);
    expect(parsePhotos([orig('a')])).toEqual([orig('a')]);
    expect(parsePhotos(null)).toEqual([]);
    expect(parsePhotos('broken')).toEqual([]);
    expect(parsePhotos(JSON.stringify([1, 'x', null]))).toEqual(['x']);
  });
});

describe('manifestFromLegacyPhotos', () => {
  // p = o, NOT null: these URLs came out of `listings.photos`, so they are
  // already public. Recording them as unpublished is what let a re-check wipe a
  // live gallery — `derivePhotos` would return [] and `persist` would write it.
  it('queues photos we own while keeping them published', () => {
    const [e] = manifestFromLegacyPhotos([orig('a')]);
    expect(e).toMatchObject({ o: orig('a'), p: orig('a'), v: 'queued', wa: false });
  });

  it('flags WhatsApp-sourced originals so compression is skipped', () => {
    expect(manifestFromLegacyPhotos([waOrig('m1')])[0].wa).toBe(true);
  });

  it('leaves third-party and data URLs external and published as-is', () => {
    const unsplash = 'https://images.unsplash.com/photo-123';
    const dataUrl = 'data:image/jpeg;base64,AAAA';
    const entries = manifestFromLegacyPhotos([unsplash, dataUrl]);
    expect(entries[0]).toMatchObject({ v: 'external', p: unsplash });
    expect(entries[1]).toMatchObject({ v: 'external', p: dataUrl });
  });
});

describe('derivePhotos', () => {
  it('publishes only passed/external entries that have a URL', () => {
    const entries: PhotoManifestEntry[] = [
      { o: orig('a'), p: derived('aa'), h: 'h', v: 'pass' },
      { o: orig('b'), p: null, h: 'h', v: 'queued' },
      { o: orig('c'), p: null, h: 'h', v: 'reject', r: 'a person was visible' },
      { o: 'https://images.unsplash.com/x', p: 'https://images.unsplash.com/x', h: null, v: 'external' },
      { o: orig('d'), p: null, h: null, v: 'skipped' },
    ];
    expect(derivePhotos(entries)).toEqual([derived('aa'), 'https://images.unsplash.com/x']);
  });

  it('preserves manifest order', () => {
    const entries: PhotoManifestEntry[] = [
      { o: orig('1'), p: derived('11'), h: 'h', v: 'pass' },
      { o: orig('2'), p: derived('22'), h: 'h', v: 'pass' },
    ];
    expect(derivePhotos(entries)).toEqual([derived('11'), derived('22')]);
  });
});

describe('reconcileManifest', () => {
  const passed: PhotoManifestEntry = { o: orig('a'), p: derived('aa'), h: 'h1', v: 'pass' };
  const rejected: PhotoManifestEntry = {
    o: orig('bad'),
    p: null,
    h: 'h2',
    v: 'reject',
    r: 'another company watermark',
    sev: 'cosmetic',
  };

  it('keeps unchanged photos untouched (matched on the derived URL)', () => {
    const { entries, added, removed } = reconcileManifest([passed], [derived('aa')]);
    expect(entries).toEqual([passed]);
    expect({ added, removed }).toEqual({ added: 0, removed: 0 });
  });

  it('also matches an entry by its original URL', () => {
    const { entries, added } = reconcileManifest([passed], [orig('a')]);
    expect(entries).toEqual([passed]);
    expect(added).toBe(0);
  });

  it('queues genuinely new photos only', () => {
    const { entries, added } = reconcileManifest([passed], [derived('aa'), orig('new')]);
    expect(added).toBe(1);
    expect(entries[1]).toMatchObject({ o: orig('new'), v: 'queued' });
    expect(entries[0]).toEqual(passed);
  });

  it('drops photos the landlord removed', () => {
    const other: PhotoManifestEntry = { o: orig('b'), p: derived('bb'), h: 'h3', v: 'pass' };
    const { entries, removed } = reconcileManifest([passed, other], [derived('aa')]);
    expect(entries).toEqual([passed]);
    expect(removed).toBe(1);
  });

  it('retains rejected entries so their reasons stay visible', () => {
    const { entries, removed } = reconcileManifest([passed, rejected], [derived('aa')]);
    expect(entries).toEqual([passed, rejected]);
    expect(removed).toBe(0);
  });

  it('does not duplicate an entry submitted twice', () => {
    const { entries } = reconcileManifest([passed], [derived('aa'), orig('a')]);
    expect(entries).toEqual([passed]);
  });

  it('reorders to match the submitted order', () => {
    const a: PhotoManifestEntry = { o: orig('a'), p: derived('aa'), h: 'h', v: 'pass' };
    const b: PhotoManifestEntry = { o: orig('b'), p: derived('bb'), h: 'h', v: 'pass' };
    const { entries } = reconcileManifest([a, b], [derived('bb'), derived('aa')]);
    expect(entries).toEqual([b, a]);
  });
});

describe('appendQueued', () => {
  it('appends unknown originals and skips ones already tracked', () => {
    const existing: PhotoManifestEntry[] = [{ o: waOrig('m1'), p: null, h: null, v: 'queued', wa: true }];
    const out = appendQueued(existing, [waOrig('m1'), waOrig('m2')]);
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ o: waOrig('m2'), v: 'queued', wa: true });
  });
});

describe('pendingEntries', () => {
  it('returns only queued entries', () => {
    const entries: PhotoManifestEntry[] = [
      { o: orig('a'), p: derived('aa'), h: 'h', v: 'pass' },
      { o: orig('b'), p: null, h: null, v: 'queued' },
    ];
    expect(pendingEntries(entries)).toHaveLength(1);
  });
});

describe('isWhatsAppUrl', () => {
  it('detects the WhatsApp storage prefix', () => {
    expect(isWhatsAppUrl(waOrig('m'))).toBe(true);
    expect(isWhatsAppUrl(orig('m'))).toBe(false);
  });
});
