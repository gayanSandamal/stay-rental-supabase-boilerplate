import { describe, expect, it } from 'vitest';
import {
  adoptOrphanPhotos,
  derivePhotos,
  parseManifest,
  parsePhotos,
  reconcileManifest,
  serializeManifest,
} from '@/lib/images/manifest';
import type { PhotoManifestEntry } from '@/lib/images/types';

/**
 * What PUT /api/listings/[id] does to photos. A Next route module may only
 * export its handlers, so the composition itself is mirrored here — these tests
 * pin the behaviour the route depends on, not the route's plumbing.
 */

const SB = 'https://abc.supabase.co/storage/v1/object/public/property-images';
const url = (n: string) => `${SB}/listings/${n}.jpg`;
const passed = (n: string): PhotoManifestEntry => ({ o: url(n), p: url(n), h: null, v: 'pass' });

function editPhotos(
  row: { photos: string | null; photosManifest: string | null },
  submitted: string[]
) {
  const adopted = adoptOrphanPhotos(
    parseManifest(row.photosManifest),
    parsePhotos(row.photos)
  ).entries;
  const { entries, added, removed } = reconcileManifest(adopted, submitted);
  const publishable = derivePhotos(entries);
  return {
    photos: publishable.length ? JSON.stringify(publishable) : null,
    photosManifest: serializeManifest(entries),
    entries,
    requeued: added > 0 || removed > 0,
  };
}

const row = (photos: string[], manifest: PhotoManifestEntry[]) => ({
  photos: photos.length ? JSON.stringify(photos) : null,
  photosManifest: serializeManifest(manifest),
});

describe('edit photo reconciliation', () => {
  it('does not re-queue a pure reorder, but does persist the new order', () => {
    const before = row([url('a'), url('b')], [passed('a'), passed('b')]);
    const after = editPhotos(before, [url('b'), url('a')]);
    expect(after.requeued).toBe(false);
    expect(after.photos).toBe(JSON.stringify([url('b'), url('a')]));
  });

  it('keeps a newly added photo out of the gallery until it passes', () => {
    // The leak this closes: an ops edit does not move the listing back to
    // `pending`, so publishing the raw submitted array showed it unchecked.
    const after = editPhotos(row([url('a')], [passed('a')]), [url('a'), url('new')]);
    expect(after.requeued).toBe(true);
    expect(after.photos).toBe(JSON.stringify([url('a')]));
    expect(after.entries.find((e) => e.o === url('new'))).toMatchObject({ v: 'queued', p: null });
  });

  it('adopts a live-but-untracked photo instead of reading it as a removal', () => {
    // A writer that predates the manifest can leave `photos` ahead of it.
    const after = editPhotos(row([url('a'), url('b')], [passed('a')]), [url('a'), url('b')]);
    expect(after.requeued).toBe(false);
    expect(after.photos).toBe(JSON.stringify([url('a'), url('b')]));
    expect(after.entries.find((e) => e.o === url('b'))).toMatchObject({ v: 'queued', p: url('b') });
  });

  it('re-queues a removal and drops the entry', () => {
    const after = editPhotos(row([url('a'), url('b')], [passed('a'), passed('b')]), [url('a')]);
    expect(after.requeued).toBe(true);
    expect(after.photos).toBe(JSON.stringify([url('a')]));
    expect(after.entries.map((e) => e.o)).toEqual([url('a')]);
  });

  it('leaves the column NULL when every photo is dropped', () => {
    const after = editPhotos(row([url('a')], [passed('a')]), []);
    expect(after.photos).toBeNull();
  });

  it('retains a rejected entry without counting it as a change', () => {
    const rejected: PhotoManifestEntry = {
      o: url('bad'),
      p: null,
      h: null,
      v: 'reject',
      r: 'contains a phone number',
    };
    const after = editPhotos(row([url('a')], [passed('a'), rejected]), [url('a')]);
    expect(after.requeued).toBe(false);
    expect(after.photos).toBe(JSON.stringify([url('a')]));
    expect(after.entries.map((e) => e.o)).toContain(url('bad'));
  });
});

describe('grandfathered photo-count guard', () => {
  /** The route's guard: `submitted > Math.max(cap, existing)`. */
  const refused = (submitted: number, existing: number, cap: number) =>
    submitted > Math.max(cap, existing);

  it('refuses a set larger than the cap', () => {
    expect(refused(8, 3, 6)).toBe(true);
  });

  it('allows exactly the cap', () => {
    expect(refused(6, 3, 6)).toBe(false);
  });

  it('keeps an already-over-cap listing editable at its current count', () => {
    // Lowering the cap must not leave a landlord unable to fix a typo.
    expect(refused(8, 8, 6)).toBe(false);
  });

  it('still refuses growth beyond the grandfathered count', () => {
    expect(refused(9, 8, 6)).toBe(true);
  });

  it('is inert when the cap is off', () => {
    expect(refused(50, 0, Infinity)).toBe(false);
  });
});
