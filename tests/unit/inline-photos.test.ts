import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  MAX_PHOTO_URL_LENGTH,
  dropInlinePhotos,
  isHostedPhotoUrl,
  unhostedPhotos,
} from '@/lib/images/photo-urls';

const HOSTED = 'https://x.supabase.co/storage/v1/object/public/property-images/public/48/a-w.webp';
const INLINE = 'data:image/jpeg;base64,' + 'A'.repeat(200_000);
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/*
 * 2026-11-05: listing 48 stored six photos as base64 data URLs and /listings
 * became an 8.4 MB page while page requests hung for 300s. See
 * lib/images/photo-urls.ts.
 */
describe('inline photos', () => {
  it('accepts hosted URLs and refuses data URLs and oversized strings', () => {
    expect(isHostedPhotoUrl(HOSTED)).toBe(true);
    expect(isHostedPhotoUrl(INLINE)).toBe(false);
    expect(isHostedPhotoUrl('blob:https://easyrent.lk/1')).toBe(false);
    expect(isHostedPhotoUrl('https://a.b/' + 'x'.repeat(MAX_PHOTO_URL_LENGTH))).toBe(false);
    expect(unhostedPhotos([HOSTED, INLINE, 7])).toEqual([INLINE, 7]);
  });

  it('drops inline photos from a stored photos value, keeping order', () => {
    const raw = JSON.stringify([INLINE, HOSTED, INLINE, HOSTED + '?2']);
    expect(dropInlinePhotos(raw)).toBe(JSON.stringify([HOSTED, HOSTED + '?2']));
    expect(dropInlinePhotos(JSON.stringify([INLINE]))).toBeNull();
  });

  it('returns the same value when there is nothing to drop', () => {
    const raw = JSON.stringify([HOSTED]);
    expect(dropInlinePhotos(raw)).toBe(raw);
    expect(dropInlinePhotos(null)).toBeNull();
  });

  it('search results never carry the manifest or an inline photo', () => {
    const q = read('lib/db/queries.ts');
    const fn = q.slice(q.indexOf('export async function getActiveListings'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toMatch(/photosManifest: _photosManifest, \.\.\.listingColumns/);
    expect(body).toMatch(/dropInlinePhotos\(row\.photos\)/);
  });

  it('both listing write routes refuse inline photos', () => {
    expect(read('app/api/listings/route.ts')).toMatch(/unhostedPhotos\(submittedPhotos\)/);
    expect(read('app/api/listings/[id]/route.ts')).toMatch(/unhostedPhotos\(/);
  });

  it('the uploader never falls back to a data URL', () => {
    const src = read('components/image-uploader.tsx');
    expect(src).not.toMatch(/readAsDataURL|toDataURL/);
  });

  it('the root layout never leaves its user promise unhandled', () => {
    const src = read('app/layout.tsx');
    expect(src).toMatch(/userPromise\.catch\(\(\) => \{\}\)/);
    expect(src).not.toMatch(/'\/api\/user': getUser\(\)/);
  });
});
