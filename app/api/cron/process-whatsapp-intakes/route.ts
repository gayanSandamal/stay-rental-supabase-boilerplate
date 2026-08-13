import { NextRequest, NextResponse } from 'next/server';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { loadLocations } from '@/lib/locations/store';
import { intakeChannelAdapters } from '@/lib/intake/channels/registry';
import { processSettledIntakes } from '@/lib/intake/process';

// A 20-intake batch does per-intake DB work + a sendText fetch each — the
// plan default (10s) can kill the run mid-publish.
export const maxDuration = 60;

/**
 * Processes settled intakes across all registered channels: parse → validate
 * → create listing (see lib/intake/process.ts). Vercel Cron (see vercel.json).
 * Secured by CRON_SECRET — fails closed.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // Fail closed: a missing CRON_SECRET must NOT make this endpoint public.
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await loadFeatureFlags();
  // Town catalogue for the matcher. Cached per instance behind a TTL, so
  // this is a no-op after the first call — same contract as the flags above.
  await loadLocations();
  if (!isFeatureEnabled('enableWhatsAppIntake')) {
    return NextResponse.json({ ok: true, skipped: 'flag off' });
  }

  const counts = await processSettledIntakes(intakeChannelAdapters);
  return NextResponse.json({
    ok: true,
    processed: counts.processed,
    published: counts.published,
    needsInfo: counts.needsInfo,
    manual: counts.manual,
  });
}
