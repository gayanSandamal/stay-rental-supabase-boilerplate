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
import { featureFlagDefaults, type FeatureFlag } from '../feature-flags';

export type CronRunner = 'vercel' | 'supabase';

/**
 * pg_cron only: what must be true, INSIDE THE DATABASE, for a tick to be worth
 * waking a Vercel function.
 *
 * WHY. A call that finds nothing to do still costs a function invocation, and
 * function time is the budget Vercel Hobby enforces (see lib/db/drizzle.ts for
 * the 2026-11-13 block). The two every-2-minute jobs were 1,440 of ~1,900
 * daily calls, and their queues are empty almost all the time. pg_cron runs in
 * Postgres, so asking first is free.
 *
 * Both conditions mirror the route's own early exits. They must be a SUPERSET
 * of what the route would act on: a condition that is false while there is
 * work delays that work. Two backstops:
 *   - a guarded job still fires unconditionally once an hour, at
 *     SAFETY_RUN_MINUTE, so a condition that has drifted from its route
 *     costs at most an hour, never the work itself;
 *   - tests/unit/cron-schedule.test.ts pins each `flag` to the flag its route
 *     checks and each `work` to the selection it mirrors, so changing what a
 *     job acts on fails until its condition is updated to match.
 */
export interface CronWakeCondition {
  /** The route returns `skipped: 'flag off'` unless this boolean flag is on. */
  flag?: FeatureFlag;
  /** SQL boolean, true whenever the route could find something to do. */
  work?: string;
}

export interface CronJob {
  /** Route under /api/cron. */
  path: `/api/cron/${string}`;
  /** Standard 5-field cron expression, UTC. */
  schedule: string;
  runner: CronRunner;
  /** pg_cron only. Absent = call on every tick. */
  wakeWhen?: CronWakeCondition;
}

export const CRON_JOBS: CronJob[] = [
  {
    path: '/api/cron/process-whatsapp-intakes',
    schedule: '*/2 * * * *',
    runner: 'supabase',
    wakeWhen: {
      flag: 'enableWhatsAppIntake',
      // processSettledIntakes (lib/intake/process.ts) claims `received` rows
      // once they have settled. Settling is the route's call, not this one's.
      work: `exists (select 1 from public.whatsapp_intakes where status = 'received')`,
    },
  },
  {
    path: '/api/cron/moderate-listings',
    schedule: '*/2 * * * *',
    runner: 'supabase',
    wakeWhen: {
      flag: 'enableListingModeration',
      // claimListings and holdAbandonedRuns (lib/moderation/engine.ts) act on
      // `queued` and `running` rows; reconcileMissedAnnouncements
      // (lib/moderation/notify.ts) on passed, live, un-notified listings
      // published within the last 24 hours.
      work:
        `exists (select 1 from public.listings where moderation_status in ('queued', 'running'))` +
        ` or exists (select 1 from public.listings where landlord_notified_at is null` +
        ` and status = 'active' and moderation_status = 'passed'` +
        ` and published_at > now() - interval '24 hours')`,
    },
  },
  {
    path: '/api/cron/publish-social',
    schedule: '*/5 * * * *',
    runner: 'supabase',
    // Flag only. The sweep, two reconcilers, metrics refresh and the
    // credential readout have no single queue worth mirroring.
    wakeWhen: { flag: 'enableSocialAutoPublish' },
  },
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

/** A guarded job also fires unconditionally at this minute of every hour, UTC. */
export const SAFETY_RUN_MINUTE = 0;

/**
 * Does the expression fire at this minute of the hour? Understands `*`,
 * `*\/N` and lists of plain numbers; anything else answers false, so a test
 * built on it fails rather than passing by accident.
 */
export function firesAtMinute(schedule: string, minute: number): boolean {
  const [field = ''] = schedule.trim().split(/\s+/);
  return field.split(',').some((part) => {
    if (part === '*') return true;
    const step = /^\*\/(\d+)$/.exec(part);
    if (step) return minute % Number(step[1]) === 0;
    return /^\d+$/.test(part) && Number(part) === minute;
  });
}

/**
 * The SQL condition pg_cron checks before calling, or null to call on every
 * tick. Built from this file only — flag names are identifiers and `work` is
 * our own code, never input.
 *
 * A flag resolves the way lib/feature-flags-store.ts resolves it: the override
 * row if there is one, otherwise the code default AS OF REGISTRATION. Changing
 * a gating flag's default therefore means re-running `pnpm cron:setup-supabase`
 * — until then the hourly safety run is what keeps the job alive.
 */
export function pgCronWakeCondition(job: CronJob): string | null {
  const when = job.wakeWhen;
  if (!when || (!when.flag && !when.work)) return null;

  const parts: string[] = [];
  if (when.flag) {
    const fallback = featureFlagDefaults[when.flag];
    if (typeof fallback !== 'boolean' || !/^[A-Za-z]+$/.test(when.flag)) {
      throw new Error(`wakeWhen.flag must name a boolean feature flag: ${when.flag}`);
    }
    parts.push(
      `coalesce((select value from public.feature_flags where key = '${when.flag}'), '${fallback}') = 'true'`
    );
  }
  if (when.work) parts.push(`(${when.work})`);

  return `(${parts.join(' and ')}) or extract(minute from now() at time zone 'UTC') = ${SAFETY_RUN_MINUTE}`;
}

export interface PgCronVaultNames {
  /** Vault secret holding the site origin, e.g. https://easyrent.lk */
  baseUrl: string;
  /** Vault secret holding CRON_SECRET */
  secret: string;
}

/**
 * The full text pg_cron runs for a job. Secrets are looked up from Vault when
 * it fires and never appear in the job text, which `--status` prints and any
 * reader of the cron schema can see.
 *
 * `select … where <condition>` evaluates the call only when the condition
 * holds, so a guarded tick with nothing to do never leaves the database.
 */
export function pgCronCommand(job: CronJob, vault: PgCronVaultNames): string {
  if (!/^\/api\/cron\/[a-z0-9-]+$/.test(job.path)) throw new Error(`Bad path ${job.path}`);
  for (const name of [vault.baseUrl, vault.secret]) {
    if (!/^[a-z_]+$/.test(name)) throw new Error(`Bad vault secret name ${name}`);
  }
  const call = `select net.http_get(
  url := (select decrypted_secret from vault.decrypted_secrets where name = '${vault.baseUrl}') || '${job.path}',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = '${vault.secret}'),
    'User-Agent', 'easyrent-pg-cron'
  ),
  timeout_milliseconds := 60000
)`;
  const when = pgCronWakeCondition(job);
  return when ? `${call}\nwhere ${when};` : `${call};`;
}
