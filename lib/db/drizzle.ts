import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import dotenv from 'dotenv';
import { holdInvocationUntilIdle } from './hold-until-idle';

dotenv.config();

// Support both DATABASE_URL (Supabase/Vercel) and POSTGRES_URL (local)
const connectionString =
  process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error(
    'Database URL not set. Set DATABASE_URL or POSTGRES_URL in your environment.'
  );
}

const IDLE_TIMEOUT_SECONDS = 2;

export const client = postgres(connectionString, {
  max: process.env.VERCEL ? 1 : 10,
  /*
   * SHORT, BECAUSE EVERY SECOND OF IT IS BILLED — on every DB-touching request.
   *
   * The invocation cannot finish until this timeout has closed the socket:
   * the socket refs the event loop (below), and the logger at the bottom of
   * this file holds the invocation for this long plus a 5s margin on purpose.
   * Fluid compute bills provisioned memory (Hobby: a fixed 2 GB) for the whole
   * time an instance is handling a request, so this number is a floor on what
   * EVERY query-running request costs, whatever it did.
   *
   * At 30s it took the site down. pg_cron fires ~1,900 calls a day
   * (lib/cron/schedule.ts), nearly all of which find nothing to do, and each
   * still cost ~35s of instance time: ~37 GB-hours a day against Hobby's 360 a
   * month. Vercel soft-blocked the project on 2026-11-13
   * (FAIR_USE_LIMITS_EXCEEDED, overage `fluidDuration`), nine days after the
   * frequent crons moved to pg_cron, and every page answered 402 until the
   * next billing cycle.
   *
   * What a short timeout costs is a reconnect for a request that arrives more
   * than 2s after the last one. That used to be the reason for a long value
   * (at 20s a low-traffic site "reconnects constantly"), but it was weighed
   * while the functions ran in iad1, across the planet from the database.
   * They run in sin1 now, beside the Singapore pooler. Measured 2026-11-25
   * from Colombo: a fresh connection plus its first query took about six
   * round trips (319 ms against 51 ms for a query on a warm connection). At
   * in-region round-trip times that should be tens of milliseconds at most,
   * TLS and SCRAM included — estimated, not yet measured from sin1.
   *
   * tests/unit/db-idle-hold.test.ts caps this at 5s.
   *
   * The 2026-09-04 history below is why it must also never approach the
   * function's max duration. An
   * open postgres-js socket REFS THE NODE EVENT LOOP, and `idle_timeout` is
   * what eventually closes it, so the invocation cannot finish until this many
   * seconds after its last query. Measured locally: with idle_timeout 300 a
   * process that ran one `select 1` is still alive 12s later holding a single
   * `Socket` handle; with 20 the same is true until second 20. On Vercel the
   * function's max duration is 300s, so every DB-touching request sat at the
   * line and was killed on it — production logged
   *
   *   GET /            200 cache=STALE  Vercel Runtime Timeout Error: Task
   *   GET /listings    200 cache=HIT    timed out after 300 seconds
   *   GET /listings/1  200 cache=HIT
   *   GET /back-office 200 cache=HIT    ([phase] ✓ getUser 2ms, then 300s)
   *
   * on 2026-09-04, once for essentially every route. The response itself was
   * fine (200, often from cache), which is why it looked like nothing was
   * wrong — but a killed invocation never completes its ISR regeneration, so
   * `/` stuck at `x-vercel-cache: STALE` with `age` climbing past 600s under a
   * 30s revalidate: the homepage stats stop updating, and a cache-missing
   * `/listings/[id]` hangs until the platform 504s it.
   *
   * Raising this again means checking the bill first and the function's
   * maxDuration second: the socket, not the query, is what holds the
   * invocation open.
   *
   * `prepare` is deliberately left unset. postgres-js then uses named prepared
   * statements, which Supavisor supports in transaction mode and which is the
   * FASTER path — setting `prepare: false` for the transaction pooler is a
   * robustness change that costs performance, not a speedup.
   */
  idle_timeout: IDLE_TIMEOUT_SECONDS,
  connect_timeout: 10,
});

/*
 * The logger is not for logging. drizzle calls it before every query, and it
 * keeps the invocation alive until the connection above has gone idle and
 * closed, so Fluid Compute never suspends an instance holding a live socket.
 * See lib/db/hold-until-idle.ts for the 2026-09-12 incident this prevents,
 * and for why it is not `attachDatabasePool` (throws for postgres-js) or
 * postgres-js's `debug` hook (would put query parameters in error logs).
 */
export const db = drizzle(client, {
  schema,
  logger: { logQuery: () => holdInvocationUntilIdle(IDLE_TIMEOUT_SECONDS) },
});
