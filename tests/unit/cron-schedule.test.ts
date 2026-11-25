import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CRON_JOBS,
  SAFETY_RUN_MINUTE,
  firesAtMinute,
  firesAtMostDaily,
  pgCronCommand,
  pgCronWakeCondition,
  supabaseJobName,
  type CronJob,
} from '@/lib/cron/schedule';
import { featureFlagDefaults } from '@/lib/feature-flags';

/**
 * Vercel Hobby rejects EVERY deployment whose vercel.json has a cron firing
 * more than once a day — that blocked all deploys on 2026-11-04. The frequent
 * jobs run from Supabase pg_cron instead (scripts/setup-supabase-cron.ts), and
 * lib/cron/schedule.ts says which runner owns each job.
 */
const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf-8')) as {
  crons?: { path: string; schedule: string }[];
};
const routes = readdirSync(join(process.cwd(), 'app/api/cron')).map((d) => `/api/cron/${d}`);

describe('cron schedule', () => {
  it('every vercel.json cron fires at most daily (Hobby plan rule)', () => {
    for (const c of vercel.crons ?? []) expect(firesAtMostDaily(c.schedule), `${c.path} ${c.schedule}`).toBe(true);
  });

  it('vercel.json lists exactly the jobs whose runner is vercel, on the same schedule', () => {
    const expected = CRON_JOBS.filter((j) => j.runner === 'vercel').map((j) => ({ path: j.path, schedule: j.schedule }));
    const actual = (vercel.crons ?? []).map((c) => ({ path: c.path, schedule: c.schedule }));
    const sort = (a: { path: string }[]) => [...a].sort((x, y) => x.path.localeCompare(y.path));
    expect(sort(actual)).toEqual(sort(expected));
  });

  it('every cron route is scheduled exactly once, by exactly one runner', () => {
    const scheduled = CRON_JOBS.map((j) => j.path).sort();
    expect(scheduled).toEqual([...new Set(scheduled)]);
    expect(scheduled).toEqual([...routes].sort());
  });

  it('a frequent job is never left on vercel', () => {
    for (const j of CRON_JOBS.filter((x) => !firesAtMostDaily(x.schedule))) expect(j.runner, j.path).toBe('supabase');
  });

  it('classifies schedules conservatively', () => {
    expect(firesAtMostDaily('30 3 * * *')).toBe(true);
    expect(firesAtMostDaily('0 4 * * 1')).toBe(true);
    expect(firesAtMostDaily('*/15 * * * *')).toBe(false);
    expect(firesAtMostDaily('0 */6 * * *')).toBe(false);
    expect(firesAtMostDaily('0 3,15 * * *')).toBe(false);
  });

  it('pg_cron job names are stable and prefixed', () => {
    expect(supabaseJobName('/api/cron/moderate-listings')).toBe('easyrent:moderate-listings');
  });
});

/**
 * A pg_cron tick that finds nothing to do must not wake a Vercel function:
 * function time is what Vercel Hobby enforces, and ~1,900 mostly-empty calls a
 * day exhausted it in nine days (soft block, 2026-11-13). `wakeWhen` asks the
 * database first. These tests keep each condition honest — a condition that
 * is false while its route has work delays that work by up to an hour.
 */
describe('pg_cron wake conditions', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
  const VAULT = { baseUrl: 'easyrent_cron_base_url', secret: 'easyrent_cron_secret' };
  const job = (path: string): CronJob => {
    const found = CRON_JOBS.find((j) => j.path === path);
    if (!found) throw new Error(`no job ${path}`);
    return found;
  };

  it('only pg_cron jobs carry one — Vercel Cron cannot evaluate SQL first', () => {
    for (const j of CRON_JOBS.filter((x) => x.runner === 'vercel')) expect(j.wakeWhen, j.path).toBeUndefined();
  });

  it('a job firing more often than every 15 minutes must say when it is worth waking', () => {
    for (const j of CRON_JOBS.filter((x) => x.runner === 'supabase')) {
      const step = /^\*\/(\d+)$/.exec(j.schedule.split(/\s+/)[0] ?? '');
      if (step && Number(step[1]) < 15) expect(j.wakeWhen, `${j.path} ${j.schedule}`).toBeDefined();
    }
  });

  it('every guarded job still fires at the hourly safety minute', () => {
    for (const j of CRON_JOBS.filter((x) => x.wakeWhen)) {
      expect(firesAtMinute(j.schedule, SAFETY_RUN_MINUTE), `${j.path} ${j.schedule}`).toBe(true);
    }
  });

  it("a flag condition names the flag its route checks, and every flag-gated pg_cron route has one", () => {
    for (const j of CRON_JOBS.filter((x) => x.runner === 'supabase')) {
      const route = read(`app${j.path}/route.ts`);
      const checked = [...route.matchAll(/isFeatureEnabled\('(\w+)'\)/g)].map((m) => m[1]);
      expect(checked.length, `${j.path} checks more than one flag — mirror them all`).toBeLessThanOrEqual(1);
      expect(j.wakeWhen?.flag ?? null, j.path).toBe(checked[0] ?? null);
    }
  });

  it('resolves a flag the way the flag store does: override row, else the code default', () => {
    for (const j of CRON_JOBS) {
      if (j.wakeWhen?.flag) expect(typeof featureFlagDefaults[j.wakeWhen.flag], j.path).toBe('boolean');
    }
    expect(pgCronWakeCondition(job('/api/cron/publish-social'))).toContain(
      `coalesce((select value from public.feature_flags where key = 'enableSocialAutoPublish'), '${featureFlagDefaults.enableSocialAutoPublish}') = 'true'`
    );
  });

  // If one of these fails you changed what a cron acts on. Update its
  // `wakeWhen.work` in lib/cron/schedule.ts to match, then the assertion.
  it('intake: mirrors processSettledIntakes', () => {
    expect(read('lib/intake/process.ts')).toContain("eq(whatsappIntakes.status, 'received')");
    expect(job('/api/cron/process-whatsapp-intakes').wakeWhen?.work).toContain("status = 'received'");
  });

  it('moderation: mirrors the claim, the abandoned-run hold and the go-live retry', () => {
    const engine = read('lib/moderation/engine.ts');
    expect(engine).toContain("WHERE moderation_status = 'queued'");
    expect(engine).toMatch(/moderation_status = 'running'\s+AND moderation_lease_until < now\(\)/);
    const notify = read('lib/moderation/notify.ts');
    expect(notify).toContain('isNull(listings.landlordNotifiedAt)');
    expect(notify).toContain("eq(listings.status, 'active')");
    expect(notify).toContain("eq(listings.moderationStatus, 'passed')");
    expect(notify).toMatch(/withinHours = 24\b/);

    const work = job('/api/cron/moderate-listings').wakeWhen?.work ?? '';
    expect(work).toContain("moderation_status in ('queued', 'running')");
    expect(work).toContain('landlord_notified_at is null');
    expect(work).toContain("status = 'active'");
    expect(work).toContain("moderation_status = 'passed'");
    expect(work).toContain("interval '24 hours'");
  });

  it('leaves an unguarded job calling on every tick, exactly as before', () => {
    const cmd = pgCronCommand(job('/api/cron/expire-listings'), VAULT);
    expect(cmd).not.toContain('extract(minute');
    expect(cmd).toMatch(/^select net\.http_get\([\s\S]*\);$/);
    expect(cmd).toContain("|| '/api/cron/expire-listings'");
  });

  it('puts the condition and the hourly safety run after a guarded call', () => {
    const cmd = pgCronCommand(job('/api/cron/moderate-listings'), VAULT);
    expect(cmd).toMatch(/\)\nwhere \([\s\S]+\) or extract\(minute from now\(\) at time zone 'UTC'\) = 0;$/);
  });

  it('never writes a secret into the job text, only Vault lookups', () => {
    for (const j of CRON_JOBS.filter((x) => x.runner === 'supabase')) {
      expect(pgCronCommand(j, VAULT)).toContain("vault.decrypted_secrets where name = 'easyrent_cron_secret'");
    }
  });

  it('refuses a path or vault name it would have to quote', () => {
    const base = job('/api/cron/expire-listings');
    expect(() => pgCronCommand({ ...base, path: "/api/cron/x'; drop table users; --" as CronJob['path'] }, VAULT)).toThrow();
    expect(() => pgCronCommand(base, { ...VAULT, secret: "x'y" })).toThrow();
  });

  it('reads minute fields conservatively', () => {
    expect(firesAtMinute('*/2 * * * *', 0)).toBe(true);
    expect(firesAtMinute('*/5 * * * *', 0)).toBe(true);
    expect(firesAtMinute('0,30 * * * *', 0)).toBe(true);
    expect(firesAtMinute('15,45 * * * *', 0)).toBe(false);
    expect(firesAtMinute('1-59/2 * * * *', 0)).toBe(false);
  });
});
