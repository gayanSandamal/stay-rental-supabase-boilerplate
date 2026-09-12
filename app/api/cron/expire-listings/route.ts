import { NextRequest, NextResponse } from 'next/server';
import { checkAndMarkExpiredListings } from '@/lib/db/check-expired-listings';

/**
 * Sweeps active listings past `expiresAt` to `status: 'expired'` and pulls
 * down their social posts. `checkAndMarkExpiredListings` (lib/db/check-
 * expired-listings.ts) has existed since before the broker-pivot review
 * (2026-09) but had no caller anywhere in the app — expiry was enforced only
 * at read time by `getActiveListings` filtering on `expiresAt`, so the
 * `'expired'` status was never actually written in production. That's
 * survivable at 1 active listing; it is not survivable once brokers bring
 * 20-40 listings each through the free back-office (Phase 1 of the broker
 * pivot) with no visible signal that any of them silently fell out of search.
 *
 * Secured by CRON_SECRET — fails closed, same contract as every other cron
 * route in app/api/cron/**.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await checkAndMarkExpiredListings();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[expire-listings] sweep failed', err);
    return NextResponse.json({ ok: false, error: 'Sweep failed' }, { status: 500 });
  }
}
