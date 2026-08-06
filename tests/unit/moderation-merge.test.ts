/**
 * The listing-#7 regression guard.
 *
 * #7 went live with 8 photos and a 1-entry manifest. Re-running moderation on
 * it would have written `photos = derivePhotos(manifest)` = 1 URL and silently
 * deleted the other seven. These tests pin the two properties that make that
 * unreachable: orphaned photos are ADOPTED rather than dropped, and a run only
 * gets to speak for the URLs it actually evaluated.
 */

import { describe, expect, it } from 'vitest';
import {
  adoptOrphanPhotos,
  derivePhotos,
  manifestFromLegacyPhotos,
  mergeRunIntoFresh,
} from '@/lib/images/manifest';
import type { PhotoManifestEntry } from '@/lib/images/types';

const SB = 'https://abc.supabase.co/storage/v1/object/public/property-images';
const wa = (n: string) => `${SB}/whatsapp-intake/${n}.jpg`;
const derived = (n: string) => `${SB}/public/7/${n}-w.webp`;

const passed = (o: string, p: string): PhotoManifestEntry => ({
  o,
  p,
  h: `h-${o}`,
  v: 'pass',
});

describe('adoptOrphanPhotos', () => {
  it('adopts photos the manifest never accounted for — the #7 shape', () => {
    const photos = Array.from({ length: 8 }, (_, i) => wa(`p${i}`));
    // What #7 actually had: one entry, already processed, for photos[0].
    const existing = [passed(photos[0], derived('aa'))];
    const live = [derived('aa'), ...photos.slice(1)];

    const { entries, adopted } = adoptOrphanPhotos(existing, live);

    expect(adopted).toBe(7);
    expect(entries).toHaveLength(8);
    // Nothing leaves the gallery.
    expect(derivePhotos(entries)).toEqual(live);
  });

  it('matches on the derived URL, so a processed photo is not adopted twice', () => {
    const existing = [passed(wa('a'), derived('aa'))];
    const { entries, adopted } = adoptOrphanPhotos(existing, [derived('aa')]);
    expect(adopted).toBe(0);
    expect(entries).toHaveLength(1);
  });

  it('is idempotent and order-preserving', () => {
    const photos = [wa('a'), wa('b'), wa('c')];
    const once = adoptOrphanPhotos([], photos).entries;
    const twice = adoptOrphanPhotos(once, photos);
    expect(twice.adopted).toBe(0);
    expect(twice.entries).toEqual(once);
    expect(derivePhotos(twice.entries)).toEqual(photos);
  });

  it('adopts a duplicated URL only once', () => {
    const { entries, adopted } = adoptOrphanPhotos([], [wa('a'), wa('a')]);
    expect(adopted).toBe(1);
    expect(entries).toHaveLength(1);
  });

  it('marks third-party URLs external rather than queueing them for processing', () => {
    const unsplash = 'https://images.unsplash.com/photo-123';
    const { entries } = adoptOrphanPhotos([], [unsplash]);
    expect(entries[0]).toMatchObject({ o: unsplash, p: unsplash, v: 'external' });
  });
});

describe('mergeRunIntoFresh', () => {
  it('keeps all 8 photos when the run only judged 1 (today’s bug)', () => {
    const photos = Array.from({ length: 8 }, (_, i) => wa(`p${i}`));
    const fresh = manifestFromLegacyPhotos(photos);
    const run = [passed(photos[0], derived('aa'))];

    const { entries, unevaluatedQueued } = mergeRunIntoFresh(
      fresh,
      run,
      new Set([photos[0]]),
      photos
    );

    expect(entries).toHaveLength(8);
    expect(derivePhotos(entries)).toHaveLength(8);
    expect(entries[0].p).toBe(derived('aa')); // the judged one got its derivative
    expect(unevaluatedQueued).toBe(7); // and the rest force a re-queue
  });

  it('excludes photos that arrived mid-run and re-queues for them', () => {
    const [a, b, c] = [wa('a'), wa('b'), wa('c')];
    // The run started with `a`; `b` and `c` landed while it was working.
    const run = [passed(a, derived('aa'))];
    const fresh: PhotoManifestEntry[] = [
      passed(a, derived('aa')),
      { o: b, p: null, h: null, v: 'queued' },
      { o: c, p: null, h: null, v: 'queued' },
    ];

    const { entries, unevaluatedQueued } = mergeRunIntoFresh(fresh, run, new Set([a]), [
      derived('aa'),
    ]);

    expect(unevaluatedQueued).toBe(2);
    // p === null keeps them out of the gallery until they are judged.
    expect(derivePhotos(entries)).toEqual([derived('aa')]);
  });

  it('does not resurrect an entry deleted concurrently', () => {
    const [a, b] = [wa('a'), wa('b')];
    const run = [passed(a, derived('aa')), passed(b, derived('bb'))];
    const fresh = [passed(a, derived('aa'))]; // b removed while the run worked

    const { entries } = mergeRunIntoFresh(fresh, run, new Set([a, b]), [derived('aa')]);

    expect(entries.map((e) => e.o)).toEqual([a]);
  });

  it('lets the run reject a photo it evaluated', () => {
    const [a, b] = [wa('a'), wa('b')];
    const fresh = manifestFromLegacyPhotos([a, b]);
    const run: PhotoManifestEntry[] = [
      passed(a, derived('aa')),
      { o: b, p: null, h: 'h', v: 'reject', r: 'contains a person', sev: 'cosmetic' },
    ];

    const { entries, unevaluatedQueued } = mergeRunIntoFresh(fresh, run, new Set([a, b]), [a, b]);

    expect(unevaluatedQueued).toBe(0);
    expect(derivePhotos(entries)).toEqual([derived('aa')]);
  });
});
