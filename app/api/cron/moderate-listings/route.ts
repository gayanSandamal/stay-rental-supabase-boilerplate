import { NextRequest, NextResponse } from 'next/server';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { sweepModerationQueue } from '@/lib/moderation/engine';
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

  const counts = await sweepModerationQueue();
  return NextResponse.json({ ok: true, ...counts });
}
