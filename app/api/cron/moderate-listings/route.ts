import { NextRequest, NextResponse } from 'next/server';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { isModerationConfigured } from '@/lib/moderation/config';

/**
 * Automated approval sweeper: claims queued listings, runs the checks, then
 * publishes or holds. Vercel Cron (see vercel.json). Secured by CRON_SECRET —
 * fails closed.
 */
export const dynamic = 'force-dynamic';
// Per listing: image downloads + vision calls + sharp + uploads ≈ 8-12s.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // Fail closed: a missing CRON_SECRET must NOT make this endpoint public.
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await loadFeatureFlags();
  if (!isFeatureEnabled('enableListingModeration')) {
    return NextResponse.json({ ok: true, skipped: 'flag off' });
  }
  if (!isModerationConfigured()) {
    return NextResponse.json({ ok: true, skipped: 'no api key' });
  }

  // Imported HERE, not at module scope: the engine pulls in sharp (a native
  // module), and a load failure at import time would 500 before the
  // CRON_SECRET guard above could run — turning a fail-closed route into an
  // open one that leaks a stack trace. Loading it after auth also means an
  // unauthenticated request never pays for it.
  try {
    const { sweepModerationQueue } = await import('@/lib/moderation/engine');
    // sharp is the only native dependency in the app and nothing else at runtime
    // touches it, so a packaging regression is invisible until photos come out
    // unprocessed. Report its health on every run: `imageToolchain.ok === false`
    // means image checks and compression/watermarking are both dead.
    const { probeImageToolchain } = await import('@/lib/images/process');
    const [counts, imageToolchain] = await Promise.all([
      sweepModerationQueue(),
      probeImageToolchain(),
    ]);
    if (!imageToolchain.ok) {
      console.error('[cron/moderate-listings] image toolchain unavailable', imageToolchain.error);
    }
    return NextResponse.json({ ok: true, ...counts, imageToolchain });
  } catch (err: any) {
    console.error('[cron/moderate-listings] failed', err);
    return NextResponse.json({ ok: false, error: err?.message ?? 'moderation failed' }, { status: 500 });
  }
}
