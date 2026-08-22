import { describe, expect, it } from 'vitest';
import { publishablePhotos, socialImageUrls, socialPhotoCap } from '@/lib/social/images';
import type { PhotoManifestEntry } from '@/lib/images/types';

/**
 * Social platforms never receive a Supabase URL. Instagram accepts JPEG only
 * (our derivatives are WebP), and TikTok only pulls from a domain verified in
 * its developer portal — which `*.supabase.co` can never be. Everything goes
 * through our own proxy instead, and these tests pin that.
 */

const SUPA = 'https://xyz.supabase.co/storage/v1/object/public/property-images';

const manifest = (entries: PhotoManifestEntry[]) => JSON.stringify(entries);

const entry = (over: Partial<PhotoManifestEntry> = {}): PhotoManifestEntry => ({
  o: `${SUPA}/whatsapp-intake/1-a.jpg`,
  p: `${SUPA}/public/1/abc123-w.webp`,
  h: 'hash',
  v: 'pass',
  ...over,
});

describe('publishablePhotos', () => {
  it('takes the published URLs from the manifest', () => {
    const listing = {
      id: 1,
      photos: JSON.stringify([`${SUPA}/public/1/abc123-w.webp`]),
      photosManifest: manifest([entry()]),
    };
    expect(publishablePhotos(listing)).toEqual([`${SUPA}/public/1/abc123-w.webp`]);
  });

  it('never publishes a rejected photo', () => {
    const listing = {
      id: 1,
      photos: null,
      photosManifest: manifest([
        entry({ p: `${SUPA}/public/1/ok-w.webp` }),
        entry({ p: `${SUPA}/public/1/bad-w.webp`, v: 'reject' }),
      ]),
    };
    expect(publishablePhotos(listing)).toEqual([`${SUPA}/public/1/ok-w.webp`]);
  });

  it('never publishes a photo still queued for checking', () => {
    const listing = {
      id: 1,
      photos: null,
      photosManifest: manifest([entry({ p: null, v: 'queued' })]),
    };
    expect(publishablePhotos(listing)).toEqual([]);
  });

  it('falls back to `photos` for a legacy listing with no manifest', () => {
    const listing = {
      id: 1,
      photos: JSON.stringify([`${SUPA}/listings/legacy.jpg`]),
      photosManifest: null,
    };
    expect(publishablePhotos(listing)).toEqual([`${SUPA}/listings/legacy.jpg`]);
  });

  it('returns nothing for a listing with no photos at all', () => {
    expect(publishablePhotos({ id: 1, photos: null, photosManifest: null })).toEqual([]);
  });
});

describe('socialPhotoCap', () => {
  it('never exceeds Instagram’s carousel ceiling of 10', () => {
    expect(socialPhotoCap()).toBeLessThanOrEqual(10);
    expect(socialPhotoCap()).toBeGreaterThanOrEqual(1);
  });
});

describe('socialImageUrls', () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => entry({ p: `${SUPA}/public/1/p${i}-w.webp` }));

  it('serves through our own proxy, never Supabase', () => {
    const urls = socialImageUrls({ id: 42, photos: null, photosManifest: manifest(many(3)) });
    expect(urls).toHaveLength(3);
    for (const url of urls) {
      expect(url).not.toContain('supabase');
      expect(url).toContain('/api/social/img/42/');
    }
  });

  it('indexes positionally so the proxy resolves the same list', () => {
    const urls = socialImageUrls({ id: 7, photos: null, photosManifest: manifest(many(3)) });
    expect(urls[0]).toMatch(/\/api\/social\/img\/7\/0\.jpg$/);
    expect(urls[2]).toMatch(/\/api\/social\/img\/7\/2\.jpg$/);
  });

  it('advertises JPEG, which is the only format Instagram accepts', () => {
    const urls = socialImageUrls({ id: 7, photos: null, photosManifest: manifest(many(2)) });
    for (const url of urls) expect(url.endsWith('.jpg')).toBe(true);
  });

  it('caps at the configured maximum', () => {
    const urls = socialImageUrls({ id: 1, photos: null, photosManifest: manifest(many(25)) });
    expect(urls.length).toBe(socialPhotoCap());
  });

  it('returns nothing when there is nothing publishable', () => {
    expect(socialImageUrls({ id: 1, photos: null, photosManifest: null })).toEqual([]);
  });
});
