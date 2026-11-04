/**
 * Register Easy Rent's frequent jobs with Supabase pg_cron (+ pg_net).
 *
 *   DATABASE_URL=… CRON_SECRET=… CRON_BASE_URL=https://easyrent.lk pnpm cron:setup-supabase
 *   … pnpm cron:setup-supabase --status     # jobs + their recent runs and HTTP results
 *   … pnpm cron:setup-supabase --remove     # unschedule every easyrent:* job
 *
 * WHY THIS EXISTS: Vercel Hobby rejects any deployment with a cron that fires
 * more than once a day, so the jobs in lib/cron/schedule.ts marked
 * runner:'supabase' are fired by pg_cron instead, which calls the same
 * /api/cron/* endpoint with the same bearer token. See that file.
 *
 * DELIBERATELY NOT A NUMBERED MIGRATION. `db:migrate-all` replays every file
 * against whatever DATABASE_URL points at, including a developer's local
 * database — a migration that scheduled HTTP calls would have every local
 * stack calling production every two minutes. This runs only when asked, with
 * an explicit base URL, and refuses a local database aimed at a remote site
 * (and the reverse).
 *
 * SECRETS LIVE IN SUPABASE VAULT, never in the job text: cron.job.command is
 * readable by anyone who can read the cron schema, and is printed by --status.
 * Each job looks the secret up from vault.decrypted_secrets when it fires, so
 * rotating CRON_SECRET is: update it in Vercel, redeploy, re-run this.
 *
 * Idempotent: cron.schedule() with an existing job name updates that job, the
 * vault entries are upserted, and easyrent:* jobs no longer in the table are
 * unscheduled — re-running after editing lib/cron/schedule.ts converges.
 */
import postgres from 'postgres';
import { CRON_JOBS, supabaseJobName } from '../lib/cron/schedule';

const SECRET_NAME = 'easyrent_cron_secret';
const BASE_URL_NAME = 'easyrent_cron_base_url';
const CLEANUP_JOB = 'easyrent:cleanup-cron-history';
const JOB_PREFIX = 'easyrent:';

const args = new Set(process.argv.slice(2));
const mode = args.has('--status') ? 'status' : args.has('--remove') ? 'remove' : 'apply';

function isLocalHost(host: string): boolean {
  return /^(localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal)(:|$)/.test(host);
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is required');
  const dbHost = dbUrl.replace(/^.*@/, '').replace(/\/.*$/, '');
  console.log(`Database: ${dbHost}`);

  const sql = postgres(dbUrl, { prepare: false, max: 1, onnotice: () => {} });
  try {
    if (mode === 'status') return await status(sql);
    if (mode === 'remove') return await remove(sql);

    const secret = process.env.CRON_SECRET;
    const baseUrl = (process.env.CRON_BASE_URL ?? '').replace(/\/+$/, '');
    if (!secret || secret.length < 16) throw new Error('CRON_SECRET is required (the same value Vercel has)');
    if (!/^https?:\/\/[^/]+$/.test(baseUrl)) {
      throw new Error('CRON_BASE_URL must be an origin with no path, e.g. https://easyrent.lk');
    }
    const siteHost = new URL(baseUrl).host;
    if (isLocalHost(dbHost) !== isLocalHost(siteHost)) {
      throw new Error(
        `Refusing: database ${dbHost} and site ${siteHost} are not both local or both remote. ` +
          'A local database must never be scheduled to call production, and vice versa.'
      );
    }
    if (!isLocalHost(siteHost) && !baseUrl.startsWith('https://')) {
      throw new Error('A remote CRON_BASE_URL must be https — the bearer token travels in the request.');
    }

    // pg_cron must live in pg_catalog-visible `cron` schema; pg_net creates `net`.
    await sql`create extension if not exists pg_cron`;
    await sql`create extension if not exists pg_net`;

    await upsertVaultSecret(sql, SECRET_NAME, secret, 'Bearer token for Easy Rent /api/cron/* (same as Vercel CRON_SECRET)');
    await upsertVaultSecret(sql, BASE_URL_NAME, baseUrl, 'Origin pg_cron calls for Easy Rent jobs');

    const wanted = CRON_JOBS.filter((j) => j.runner === 'supabase');
    for (const job of wanted) {
      const name = supabaseJobName(job.path);
      // The command is fixed text built from our own table; only the path
      // varies, and it is checked against a strict pattern first.
      if (!/^\/api\/cron\/[a-z0-9-]+$/.test(job.path)) throw new Error(`Bad path ${job.path}`);
      const command = `select net.http_get(
  url := (select decrypted_secret from vault.decrypted_secrets where name = '${BASE_URL_NAME}') || '${job.path}',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = '${SECRET_NAME}'),
    'User-Agent', 'easyrent-pg-cron'
  ),
  timeout_milliseconds := 60000
);`;
      await sql`select cron.schedule(${name}, ${job.schedule}, ${command})`;
      console.log(`  scheduled ${name.padEnd(40)} ${job.schedule}`);
    }

    // pg_cron keeps a row per run forever; at every-2-minutes that is ~2k rows
    // a day per job. pg_net already expires its own responses after 6 hours.
    await sql`select cron.schedule(${CLEANUP_JOB}, '15 3 * * *', ${"delete from cron.job_run_details where end_time < now() - interval '3 days'"})`;
    console.log(`  scheduled ${CLEANUP_JOB.padEnd(40)} 15 3 * * *`);

    const keep = new Set([...wanted.map((j) => supabaseJobName(j.path)), CLEANUP_JOB]);
    const existing = await sql<{ jobname: string }[]>`select jobname from cron.job where jobname like ${JOB_PREFIX + '%'}`;
    for (const { jobname } of existing) {
      if (!keep.has(jobname)) {
        await sql`select cron.unschedule(${jobname})`;
        console.log(`  unscheduled stale ${jobname}`);
      }
    }
    console.log(`\nDone: ${wanted.length} jobs call ${baseUrl}. Check them with --status in a few minutes.`);
  } finally {
    await sql.end();
  }
}

async function upsertVaultSecret(sql: postgres.Sql, name: string, value: string, description: string) {
  const [row] = await sql<{ id: string }[]>`select id from vault.secrets where name = ${name}`;
  if (row) {
    await sql`select vault.update_secret(${row.id}::uuid, ${value})`;
  } else {
    await sql`select vault.create_secret(${value}, ${name}, ${description})`;
  }
  console.log(`  vault secret ${name} saved`);
}

async function status(sql: postgres.Sql) {
  const jobs = await sql<{ jobid: number; jobname: string; schedule: string; active: boolean }[]>`
    select jobid, jobname, schedule, active from cron.job where jobname like ${JOB_PREFIX + '%'} order by jobname`;
  if (jobs.length === 0) {
    console.log('No easyrent:* jobs are scheduled.');
    return;
  }
  for (const j of jobs) {
    const runs = await sql<{ status: string; start_time: Date; return_message: string | null }[]>`
      select status, start_time, return_message from cron.job_run_details
      where jobid = ${j.jobid} order by start_time desc limit 3`;
    const last = runs[0];
    console.log(
      `${j.active ? '●' : '○'} ${j.jobname.padEnd(40)} ${j.schedule.padEnd(14)} ` +
        (last ? `last ${last.status} at ${last.start_time.toISOString()}` : 'not run yet')
    );
  }
  // HTTP outcomes of the calls (pg_net keeps ~6h). 200 = the endpoint ran;
  // 401 = CRON_SECRET in Vault does not match Vercel's.
  const http = await sql<{ status_code: number | null; n: number; error_msg: string | null }[]>`
    select status_code, count(*)::int as n, max(error_msg) as error_msg
    from net._http_response where created > now() - interval '1 hour'
    group by status_code order by n desc`;
  console.log('\nHTTP results, last hour:');
  for (const r of http) console.log(`  ${String(r.status_code ?? 'error').padEnd(6)} × ${r.n}${r.error_msg ? `  (${r.error_msg})` : ''}`);
  if (http.length === 0) console.log('  (none yet)');
}

async function remove(sql: postgres.Sql) {
  const existing = await sql<{ jobname: string }[]>`select jobname from cron.job where jobname like ${JOB_PREFIX + '%'}`;
  for (const { jobname } of existing) {
    await sql`select cron.unschedule(${jobname})`;
    console.log(`  unscheduled ${jobname}`);
  }
  console.log(existing.length ? 'Done.' : 'Nothing to remove.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
