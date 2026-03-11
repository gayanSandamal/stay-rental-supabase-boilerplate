import { NextRequest, NextResponse } from 'next/server';
import { refreshSearchLocationSuggestions } from '@/lib/db/search-suggestions';

/**
 * Vercel Cron: refreshes search_location_suggestions materialized view.
 * Runs every 15 minutes. Secured by CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await refreshSearchLocationSuggestions();
    return NextResponse.json({ ok: true, refreshed: true });
  } catch (error) {
    console.error('[cron/refresh-suggestions]', error);
    return NextResponse.json(
      { ok: false, error: 'Refresh failed' },
      { status: 500 }
    );
  }
}
