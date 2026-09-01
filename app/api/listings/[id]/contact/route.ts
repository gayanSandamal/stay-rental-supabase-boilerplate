import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { listingContactEvents, listingContactNumbers, listings } from '@/lib/db/schema';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { isContactChannel } from '@/lib/analytics/contact-events';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { loadFeatureFlags } from '@/lib/feature-flags-store';

/**
 * POST /api/listings/[id]/contact
 *
 * Records a tapped Call or WhatsApp button. Modelled on the sibling `view`
 * route: rate-limited by IP, only for active listings, and silently `{ ok: true }`
 * for anything it declines to record.
 *
 * SILENCE IS THE CONTRACT. The caller is a fire-and-forget beacon sent
 * alongside a navigation to `tel:` or `wa.me`; nothing on the page waits for
 * this response or can act on it. An error status here would tell the renter
 * nothing and tell an enumerator which listing ids exist.
 *
 * Body: { channel: 'call' | 'whatsapp', contactNumberId?: number }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(ip, 'POST', '/api/listings/[id]/contact');
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  const resolvedParams = params instanceof Promise ? await params : params;
  const listingId = Number(resolvedParams.id);

  if (!Number.isInteger(listingId) || listingId <= 0) {
    return NextResponse.json({ error: 'Invalid listing ID' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { channel, contactNumberId } = (body ?? {}) as {
    channel?: unknown;
    contactNumberId?: unknown;
  };
  if (!isContactChannel(channel)) {
    return NextResponse.json({ error: 'Invalid channel' }, { status: 400 });
  }

  // Flag reads are per-instance snapshots; this route may be the first thing an
  // instance serves, so resolve overrides before checking.
  await loadFeatureFlags();
  if (!isFeatureEnabled('trackContactClicks')) {
    return NextResponse.json({ ok: true });
  }

  const listing = await db.query.listings.findFirst({
    where: eq(listings.id, listingId),
    columns: { id: true, status: true },
  });

  if (!listing || listing.status !== 'active') {
    return NextResponse.json({ ok: true }); // Silently ignore
  }

  /*
   * The client names which number was tapped, so it is checked rather than
   * trusted: an id belonging to another listing would attribute this listing's
   * leads to a stranger's phone number. Anything that does not verify is stored
   * as NULL — the tap still counts, we just do not claim to know the number.
   */
  let resolvedContactNumberId: number | null = null;
  if (typeof contactNumberId === 'number' && Number.isInteger(contactNumberId)) {
    const link = await db.query.listingContactNumbers.findFirst({
      where: and(
        eq(listingContactNumbers.id, contactNumberId),
        eq(listingContactNumbers.listingId, listingId)
      ),
      columns: { id: true },
    });
    resolvedContactNumberId = link?.id ?? null;
  }

  await db.insert(listingContactEvents).values({
    listingId,
    channel,
    contactNumberId: resolvedContactNumberId,
    occurredAt: new Date(),
  });

  return NextResponse.json({ ok: true });
}
