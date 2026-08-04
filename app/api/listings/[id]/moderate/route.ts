import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { listings } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { isModerationConfigured } from '@/lib/moderation/config';

/**
 * Run the automated checks for one listing immediately, instead of waiting for
 * the sweeper. Admin/ops only.
 *
 * Exists for two reasons: ops need to re-check a listing after fixing it or
 * restoring a photo, and the e2e suite needs a deterministic trigger rather
 * than a cron tick.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin' && user.role !== 'ops') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const resolved = params instanceof Promise ? await params : params;
  const id = Number(resolved.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid listing ID' }, { status: 400 });
  }

  await loadFeatureFlags();
  if (!isFeatureEnabled('enableListingModeration')) {
    return NextResponse.json({ error: 'Moderation is disabled' }, { status: 409 });
  }
  if (!isModerationConfigured()) {
    return NextResponse.json({ error: 'Moderation provider is not configured' }, { status: 409 });
  }

  const listing = await db.query.listings.findFirst({ where: eq(listings.id, id) });
  if (!listing) return NextResponse.json({ error: 'Listing not found' }, { status: 404 });

  try {
    // Lazy for the same reason as the cron route: keep native-module load
    // failures out of the pre-auth path.
    const { moderateListing } = await import('@/lib/moderation/engine');
    const verdict = await moderateListing(listing);
    return NextResponse.json({
      ok: true,
      outcome: verdict.outcome,
      language: verdict.language,
      reasons: verdict.reasons,
      dropped: verdict.droppedUrls.length,
      kept: verdict.keptUrls.length,
      usage: verdict.usage,
      durationMs: verdict.durationMs,
    });
  } catch (err: any) {
    console.error('[moderate] manual run failed', id, err);
    return NextResponse.json({ error: err?.message ?? 'Moderation failed' }, { status: 500 });
  }
}
