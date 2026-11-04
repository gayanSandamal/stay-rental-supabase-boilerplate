/**
 * EVERY SCHEDULED JOB, AND WHO RUNS IT. The single source of truth.
 *
 * Easy Rent is on Vercel's Hobby plan, which rejects any deployment whose
 * `vercel.json` has a cron that fires more than once a day ("Hobby accounts
 * are limited to daily cron jobs") — every deploy, not just a new feature. So
 * the jobs that must run every few minutes are driven by Supabase instead:
 * pg_cron fires on schedule and pg_net calls the same `/api/cron/*` endpoint
 * with the same `CRON_SECRET` bearer token Vercel Cron would send. The
 * endpoints cannot tell the difference and did not change.
 *
 *   runner 'vercel'   → listed in vercel.json (daily or rarer only)
 *   runner 'supabase' → registered by `pnpm cron:setup-supabase`
 *
 * tests/unit/cron-schedule.test.ts holds vercel.json, this table and the
 * routes under app/api/cron in agreement, so a job can neither be dropped nor
 * scheduled twice — two runners on one job would double-send WhatsApp replies.
 *
 * Vercel's Hobby crons are also only accurate to the HOUR (a "03:30" job runs
 * sometime between 03:00 and 03:59), which is fine for the three that stay.
 */
export type CronRunner = 'vercel' | 'supabase';

export interface CronJob {
  /** Route under /api/cron. */
  path: `/api/cron/${string}`;
  /** Standard 5-field cron expression, UTC. */
  schedule: string;
  runner: CronRunner;
}

export const CRON_JOBS: CronJob[] = [
  { path: '/api/cron/process-whatsapp-intakes', schedule: '*/2 * * * *', runner: 'supabase' },
  { path: '/api/cron/moderate-listings', schedule: '*/2 * * * *', runner: 'supabase' },
  { path: '/api/cron/publish-social', schedule: '*/5 * * * *', runner: 'supabase' },
  { path: '/api/cron/expire-listings', schedule: '*/15 * * * *', runner: 'supabase' },
  { path: '/api/cron/refresh-suggestions', schedule: '*/15 * * * *', runner: 'supabase' },
  { path: '/api/cron/saved-search-alerts', schedule: '0 */6 * * *', runner: 'supabase' },
  { path: '/api/cron/purge-archived', schedule: '30 3 * * *', runner: 'vercel' },
  { path: '/api/cron/landlord-reports', schedule: '0 4 * * *', runner: 'vercel' },
  { path: '/api/cron/market-snapshot', schedule: '0 4 * * 1', runner: 'vercel' },
];

/** pg_cron job name for a route — stable, so re-running setup updates in place. */
export function supabaseJobName(path: string): string {
  return `easyrent${path.replace('/api/cron/', ':')}`;
}

/**
 * Does this expression fire at most once a day? Hobby's rule, checked
 * conservatively: minute and hour must both be single fixed numbers.
 */
export function firesAtMostDaily(schedule: string): boolean {
  const [minute, hour] = schedule.trim().split(/\s+/);
  return /^\d+$/.test(minute ?? '') && /^\d+$/.test(hour ?? '');
}
