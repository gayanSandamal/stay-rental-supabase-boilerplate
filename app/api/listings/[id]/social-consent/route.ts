import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { listings } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { recordConsent } from '@/lib/social/consent';

/**
 * Grant or withdraw permission to share a listing on Easy Rent's own social
 * accounts.
 *
 * This is the web equivalent of the WhatsApp YES/NO prompt, serving both the
 * checkbox on the listing form and the one-click CTA on the go-live
 * notification. Owner or ops only — consent to publish someone's property
 * photos is theirs to give, not any signed-in user's.
 */
export const dynamic = 'force-dynamic';

const consentSchema = z.object({ granted: z.boolean() });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = params instanceof Promise ? await params : params;
    const listingId = Number(resolvedParams.id);
    if (!Number.isInteger(listingId) || listingId <= 0) {
      return NextResponse.json({ error: 'Invalid listing ID' }, { status: 400 });
    }

    const parsed = consentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    await loadFeatureFlags();
    if (!isFeatureEnabled('enableSocialAutoPublish')) {
      return NextResponse.json({ error: 'Social sharing is not enabled' }, { status: 404 });
    }

    const listing = await db.query.listings.findFirst({
      where: eq(listings.id, listingId),
      with: { landlord: true },
    });
    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }

    const isAdminOrOps = user.role === 'admin' || user.role === 'ops';
    const isOwner = listing.landlord?.userId === user.id || listing.createdBy === user.id;
    if (!isAdminOrOps && !isOwner) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const queued = await recordConsent({
      listingId,
      granted: parsed.data.granted,
      // An owner acting on their own listing is a `web` consent even when they
      // also hold ops — the distinction records who the permission came FROM.
      source: isOwner ? 'web' : 'ops',
      userId: user.id,
    });

    return NextResponse.json({
      ok: true,
      granted: parsed.data.granted,
      queued,
      // A pending listing records consent now and queues at publish, so the UI
      // can say "we'll share it when it goes live" rather than implying silence.
      pending: parsed.data.granted && queued === 0 && listing.status !== 'active',
    });
  } catch (error) {
    console.error('[api/social-consent] failed', error);
    return NextResponse.json({ error: 'Failed to record consent' }, { status: 500 });
  }
}
