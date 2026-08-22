/**
 * Public JPEG renditions of a listing's photos, for social platforms to fetch.
 *
 * This route exists because the stored derivatives cannot be handed to the
 * networks directly:
 *   · Instagram's Content Publishing API accepts JPEG only — ours are WebP.
 *   · Instagram rejects aspect ratios outside 4:5–1.91:1 AND applies the first
 *     carousel image's ratio to every slide, so all images must share one canvas.
 *   · TikTok only pulls from a domain verified in its developer portal, and
 *     `*.supabase.co` is not ours to verify. `https://<our-domain>/api/social/img/`
 *     is the verified URL prefix.
 *
 * Deliberately unauthenticated — Meta and TikTok fetch it anonymously — but it
 * serves ACTIVE listings only, so a pending, held or archived listing's photos
 * are never reachable through it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { listings } from '@/lib/db/schema';
import { fetchOriginal } from '@/lib/images/store';
import { ImageToolchainUnavailableError, loadSharp } from '@/lib/images/process';
import { publishablePhotos, socialPhotoCap } from '@/lib/social/images';
import {
  SOCIAL_IMAGE_BACKGROUND,
  SOCIAL_IMAGE_HEIGHT,
  SOCIAL_IMAGE_QUALITY,
  SOCIAL_IMAGE_WIDTH,
} from '@/lib/social/config';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ listingId: string; index: string }> }
) {
  const { listingId: rawId, index: rawIndex } = await params;

  const listingId = Number(rawId);
  // The index may carry a `.jpg` suffix — some crawlers insist on an extension.
  const index = Number(String(rawIndex).replace(/\.jpe?g$/i, ''));
  if (!Number.isInteger(listingId) || listingId < 1) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!Number.isInteger(index) || index < 0 || index >= socialPhotoCap()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const listing = await db.query.listings.findFirst({
    where: eq(listings.id, listingId),
    columns: { id: true, status: true, photos: true, photosManifest: true },
  });

  // Active only. A listing that was pulled, held or archived must stop serving
  // images immediately, even to a platform that already has the URL.
  if (!listing || listing.status !== 'active') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const photos = publishablePhotos(listing);
  const source = photos[index];
  if (!source) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const original = await fetchOriginal(source);
  if (!original) {
    // Upstream storage hiccup — retriable, so say so rather than 404.
    return NextResponse.json({ error: 'Image unavailable' }, { status: 502 });
  }

  try {
    const sharp = await loadSharp();
    const buffer = await sharp(original.buffer)
      .rotate() // bake EXIF orientation before resizing
      .resize(SOCIAL_IMAGE_WIDTH, SOCIAL_IMAGE_HEIGHT, {
        // `contain`, not `cover`: letterboxing a property photo is a far
        // smaller loss than cropping the house out of it.
        fit: 'contain',
        background: SOCIAL_IMAGE_BACKGROUND,
      })
      .flatten({ background: SOCIAL_IMAGE_BACKGROUND }) // JPEG has no alpha
      .jpeg({ quality: SOCIAL_IMAGE_QUALITY, mozjpeg: true })
      .toBuffer();

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(buffer.length),
        // Content is stable for a given (listing, index) and the platforms
        // re-fetch; let the CDN absorb it.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    if (err instanceof ImageToolchainUnavailableError) {
      // sharp could not load. 503 so the caller retries rather than caching a
      // failure — probeImageToolchain() surfaces the same fault to ops.
      console.error('[social] image toolchain unavailable', err.message);
      return NextResponse.json({ error: 'Image processing unavailable' }, { status: 503 });
    }
    console.error('[social] image transcode failed', listingId, index, err);
    return NextResponse.json({ error: 'Image processing failed' }, { status: 500 });
  }
}
