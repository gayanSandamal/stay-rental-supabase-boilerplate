import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CRON_JOBS, firesAtMostDaily, supabaseJobName } from '@/lib/cron/schedule';

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
