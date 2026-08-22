import { NextRequest, NextResponse } from 'next/server';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { loadFeatureFlags } from '@/lib/feature-flags-store';

/**
 * Social publish sweeper: claims consented listings and posts them to Easy
 * Rent's own Facebook Page, Instagram and TikTok accounts, and parks a
 * paste-ready draft for the Facebook Group. Vercel Cron (see vercel.json).
 * Secured by CRON_SECRET — fails closed.
 *
 * Runs every 5 minutes rather than every 2 like the other queues: posting is
 * not latency-sensitive, and a slower cadence keeps well clear of the
 * platforms' publishing rate limits.
 */
export const dynamic = 'force-dynamic';
// Instagram container ingestion and TikTok status polling dominate the runtime;
// the worker enforces its own wall-clock budget well inside this.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // Fail closed: a missing CRON_SECRET must NOT make this endpoint public.
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await loadFeatureFlags();
  if (!isFeatureEnabled('enableSocialAutoPublish')) {
    return NextResponse.json({ ok: true, skipped: 'flag off' });
  }

  // Imported after the guard for the same reason as the moderation cron: this
  // pulls in the DB and the adapter graph, and an import-time failure must not
  // 500 before the secret check has run.
  try {
    const { sweepSocialQueue } = await import('@/lib/social/publish');
    const counts = await sweepSocialQueue();

    // Re-ask anyone whose consent prompt never landed. Its own try/catch so it
    // still runs on an empty-queue tick and can never fail the sweep.
    let prompted = 0;
    try {
      const { reconcileMissedSocialPrompts } = await import('@/lib/social/consent');
      ({ prompted } = await reconcileMissedSocialPrompts());
    } catch (err) {
      console.error('[cron/publish-social] prompt reconcile failed', err);
    }

    // Same reasoning as `imageToolchain` on /api/cron/moderate-listings: the
    // credentials are the other thing that can be silently dead while every
    // code path looks healthy, and reading Vercel logs is a poor way to find
    // out. Own try/catch — a health readout must never fail the sweep.
    let credentials: Record<string, unknown> | undefined;
    try {
      const { checkSocialCredentials, summariseCredentialHealth } = await import(
        '@/lib/social/health'
      );
      credentials = summariseCredentialHealth(await checkSocialCredentials());
    } catch (err) {
      console.error('[cron/publish-social] credential check failed', err);
    }

    return NextResponse.json({ ok: true, ...counts, prompted, credentials });
  } catch (err: any) {
    console.error('[cron/publish-social] failed', err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'social publish failed' },
      { status: 500 }
    );
  }
}
