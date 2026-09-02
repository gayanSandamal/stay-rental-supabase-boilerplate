import { NextRequest, NextResponse } from 'next/server';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { runLandlordReports } from '@/lib/reports/send';

/**
 * Vercel Cron: scheduled listing-performance reports to landlords over WhatsApp.
 *
 * Runs ONCE A DAY and decides per landlord whether a weekly or daily report is
 * due (see lib/reports/period.ts) — one schedule, one batch budget, one set of
 * failure modes, and a landlord who switches cadence mid-week cannot end up
 * with two reports or none.
 *
 * Scheduled for 04:00 UTC = 09:30 Sri Lanka time. The hour is the whole point:
 * a report is a nudge to act on a property today, and one that arrives at 3am
 * local is a notification a landlord swipes away without reading. Every other
 * cron in this app is scheduled by machine convenience; this one is scheduled
 * by when a human will read it.
 *
 * Secured by CRON_SECRET, failing closed exactly like the other jobs that send
 * outbound messages.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // Fail closed: a missing CRON_SECRET must NOT make this endpoint public. It
  // sends billable WhatsApp messages and writes to the DB.
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // The master switch lives in the feature_flags table, and a cron invocation
    // is a cold server instance with nothing but the compile-time defaults
    // loaded. Without this the back-office toggle would appear to do nothing.
    await loadFeatureFlags();

    const result = await runLandlordReports();

    if (result.failed > 0) {
      // Rejections are the signal worth acting on — a number that has left
      // WhatsApp, or a template that stopped being approved. Dry runs are not
      // failures and are counted separately.
      console.warn('[cron/landlord-reports] deliveries rejected', {
        failed: result.failed,
        sent: result.sent,
      });
    }

    if (result.saturated) {
      // The batch budget ran out with landlords still waiting. Harmless once —
      // tomorrow's run picks them up oldest-first — but sustained saturation
      // means the send limit needs raising or the job needs splitting.
      console.warn('[cron/landlord-reports] send budget saturated', result);
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (error: unknown) {
    console.error('[cron/landlord-reports]', error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
