import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNotNull, lt } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { listings, whatsappIntakes } from '@/lib/db/schema';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { logListingAction } from '@/lib/db/audit-logger';
import { parseManifest, parsePhotos } from '@/lib/images/manifest';
import { removeListingObjects } from '@/lib/images/store';
import { purgeDeadTokens } from '@/lib/auth/access-links';

/**
 * Retention sweep: listings a landlord removed are archived immediately and
 * permanently deleted 30 days later, together with their storage objects.
 *
 * Also prunes dead access tokens and expired conversation state. Secured by
 * CRON_SECRET — fails closed.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RETENTION_DAYS = 30;
const BATCH = 20;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await loadFeatureFlags();

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const due = await db.query.listings.findMany({
    where: and(
      eq(listings.status, 'archived'),
      isNotNull(listings.archivedAt),
      lt(listings.archivedAt, cutoff)
    ),
    limit: BATCH,
  });

  let purged = 0;
  for (const listing of due) {
    try {
      // Storage first: if the row goes but the objects don't, we lose the URLs
      // needed to find them.
      // The union, not the manifest alone: a manifest that under-covers the
      // gallery would leak every untracked object. removeListingObjects skips
      // URLs outside our bucket, so a superset costs nothing.
      const manifest = parseManifest(listing.photosManifest);
      const objectUrls = Array.from(
        new Set([
          ...manifest.flatMap((e) => (e.p ? [e.o, e.p] : [e.o])),
          ...parsePhotos(listing.photos),
        ])
      );
      await removeListingObjects(listing.id, objectUrls);

      // The intake FK is ON DELETE SET NULL (migration 0032), but null it
      // explicitly so the intake row keeps a readable trail.
      await db
        .update(whatsappIntakes)
        .set({ listingId: null, updatedAt: new Date() })
        .where(eq(whatsappIntakes.listingId, listing.id));

      await logListingAction('listing_purged', listing.id, listing.createdBy ?? 0, {
        archivedAt: listing.archivedAt?.toISOString() ?? null,
        title: listing.title,
      }).catch(() => {});

      await db.delete(listings).where(eq(listings.id, listing.id));
      purged++;
    } catch (err) {
      console.error('[purge] failed for listing', listing.id, err);
    }
  }

  let tokensPurged = 0;
  try {
    tokensPurged = await purgeDeadTokens();
  } catch (err) {
    console.error('[purge] token prune failed', err);
  }

  return NextResponse.json({ ok: true, candidates: due.length, purged, tokensPurged });
}
