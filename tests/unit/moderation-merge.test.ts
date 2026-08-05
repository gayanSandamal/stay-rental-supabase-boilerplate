import { describe, expect, it } from 'vitest';
import {
  adoptOrphanPhotos,
  derivePhotos,
  manifestFromLegacyPhotos,
  mergeRunIntoFresh,
} from '@/lib/images/manifest';
import type { PhotoManifestEntry } from '@/lib/images/types';

/**
 * Guards the production incident on listing #7: 8 live photos, a 1-entry
 * manifest, and a moderation run that would have rewritten `photos` from that
 * manifest — silently deleting 7 photos it had never looked at.
 */

const SB = 'https://abc.supabase.co/storage/v1/object/public/property-images';
const wa = (n: string) => `${SB}/whatsapp-intake/${n}.jpeg`;
const derived = (n: string) => `${SB}/public/7/${n}-w.webp`;

describe('adoptOrphanPhotos', () => {
  it('adopts live photos the manifest never knew about', () => {
    const existing: PhotoManifestEntry[] = [{ o: wa('1'), p: derived('1'), h: 'h1', v: 'pass' }];
    const photos = [derived('1'), wa('2'), wa('3')];

    const { entries, adopted } = adoptOrphanPhotos(existing, photos);

    expect(adopted).toBe(2);
    expect(entries).toHaveLength(3);
    // Adopted entries stay visible (p = o) and are scheduled for a check.
    expect(entries[1]).toMatchObject({ o: wa('2'), p: wa('2'), v: 'queued', wa: true });
  });

  it('does NOT duplicate when a photo is live under its DERIVED url', () => {
    // Matching on `o` alone would adopt derived('1') as a second entry.
    const existing: PhotoManifestEntry[] = [{ o: wa('1'), p: derived('1'), h: 'h1', v: 'pass' }];
    const { entries, adopted } = adoptOrphanPhotos(existing, [derived('1')]);
    expect(adopted).toBe(0);
    expect(entries).toHaveLength(1);
  });

  it('is idempotent', () => {
    const first = adoptOrphanPhotos([], [wa('1'), wa('2')]);
    const second = adoptOrphanPhotos(first.entries, [wa('1'), wa('2')]);
    expect(second.adopted).toBe(0);
    expect(second.entries).toEqual(first.entries);
  });

  it('preserves photo order and returns the same array when nothing is orphaned', () => {
    const existing = manifestFromLegacyPhotos([wa('1'), wa('2')]);
    const { entries, adopted } = adoptOrphanPhotos(existing, [wa('1'), wa('2')]);
    expect(adopted).toBe(0);
    expect(entries).toBe(existing);
  });

  it('marks a third-party orphan external rather than queued', () => {
    const { entries } = adoptOrphanPhotos([], ['https://images.unsplash.com/photo-1']);
    expect(entries[0]).toMatchObject({ v: 'external', p: 'https://images.unsplash.com/photo-1' });
  });

  it('handles an empty gallery', () => {
    expect(adoptOrphanPhotos([], []).entries).toEqual([]);
  });
});

describe('mergeRunIntoFresh — listing #7 regression', () => {
  it('never drops a photo the run did not evaluate', () => {
    // Exactly production: photos has 8, the manifest has 1, and the run only
    // ever saw that one. Before the fix this yielded 1 published photo.
    const photos = [derived('1'), ...Array.from({ length: 7 }, (_, i) => wa(`p${i + 2}`))];
    const fresh: PhotoManifestEntry[] = [{ o: wa('1'), p: derived('1'), h: 'h1', v: 'pass' }];
    const run: PhotoManifestEntry[] = [{ o: wa('1'), p: derived('1'), h: 'h1', v: 'pass' }];

    const { entries, unevaluatedQueued } = mergeRunIntoFresh(
      fresh,
      run,
      new Set([wa('1')]),
      photos
    );

    expect(entries).toHaveLength(8);
    expect(derivePhotos(entries)).toHaveLength(8);
    expect(derivePhotos(entries)).toEqual(photos);
    // The 7 adopted photos still need checking, so the listing must re-queue.
    expect(unevaluatedQueued).toBe(7);
  });

  it('applies the run verdict only to URLs it actually evaluated', () => {
    const fresh: PhotoManifestEntry[] = [
      { o: wa('a'), p: wa('a'), h: null, v: 'queued' },
      { o: wa('b'), p: wa('b'), h: null, v: 'queued' },
    ];
    const run: PhotoManifestEntry[] = [
      { o: wa('a'), p: null, h: 'ha', v: 'reject', r: 'a person was visible', sev: 'cosmetic' },
      { o: wa('b'), p: null, h: 'hb', v: 'reject', r: 'stale — never evaluated' },
    ];

    const { entries } = mergeRunIntoFresh(fresh, run, new Set([wa('a')]), [wa('a'), wa('b')]);

    expect(entries[0].v).toBe('reject'); // evaluated → run wins
    expect(entries[1].v).toBe('queued'); // not evaluated → fresh wins
    expect(derivePhotos(entries)).toEqual([wa('b')]); // the reject left the gallery
  });

  it('keeps photos that arrived mid-run and flags the listing for another pass', () => {
    const fresh: PhotoManifestEntry[] = [
      { o: wa('1'), p: wa('1'), h: null, v: 'queued' },
      { o: wa('late1'), p: null, h: null, v: 'queued' },
      { o: wa('late2'), p: null, h: null, v: 'queued' },
    ];
    const run: PhotoManifestEntry[] = [{ o: wa('1'), p: derived('1'), h: 'h1', v: 'pass' }];

    const { entries, unevaluatedQueued } = mergeRunIntoFresh(fresh, run, new Set([wa('1')]), [
      wa('1'),
    ]);

    expect(unevaluatedQueued).toBe(2);
    expect(entries).toHaveLength(3);
    // Mid-run arrivals stay invisible until they are checked.
    expect(derivePhotos(entries)).toEqual([derived('1')]);
  });

  it('does not resurrect an entry a concurrent edit deleted', () => {
    const fresh: PhotoManifestEntry[] = [{ o: wa('keep'), p: wa('keep'), h: null, v: 'queued' }];
    const run: PhotoManifestEntry[] = [
      { o: wa('keep'), p: derived('keep'), h: 'h', v: 'pass' },
      { o: wa('deleted'), p: derived('deleted'), h: 'h', v: 'pass' },
    ];

    const { entries } = mergeRunIntoFresh(
      fresh,
      run,
      new Set([wa('keep'), wa('deleted')]),
      [wa('keep')]
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].o).toBe(wa('keep'));
  });

  it('reports zero unevaluated queued entries after a complete run', () => {
    const fresh = manifestFromLegacyPhotos([wa('1'), wa('2')]);
    const run: PhotoManifestEntry[] = [
      { o: wa('1'), p: derived('1'), h: 'h1', v: 'pass' },
      { o: wa('2'), p: derived('2'), h: 'h2', v: 'pass' },
    ];

    const { unevaluatedQueued, entries } = mergeRunIntoFresh(
      fresh,
      run,
      new Set([wa('1'), wa('2')]),
      [wa('1'), wa('2')]
    );

    expect(unevaluatedQueued).toBe(0);
    expect(derivePhotos(entries)).toEqual([derived('1'), derived('2')]);
  });
});
