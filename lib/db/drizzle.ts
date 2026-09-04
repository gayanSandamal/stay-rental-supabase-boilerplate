import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import dotenv from 'dotenv';

dotenv.config();

// Support both DATABASE_URL (Supabase/Vercel) and POSTGRES_URL (local)
const connectionString =
  process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error(
    'Database URL not set. Set DATABASE_URL or POSTGRES_URL in your environment.'
  );
}

export const client = postgres(connectionString, {
  max: process.env.VERCEL ? 1 : 10,
  /*
   * Long enough that a warm instance keeps its connection between navigations,
   * SHORT ENOUGH THAT IT CANNOT REACH THE FUNCTION'S MAX DURATION.
   *
   * The reason for a generous value stands: at 20s a low-traffic site
   * reconnects constantly, and most requests arrived on a warm instance whose
   * pool had already closed, paying a fresh TCP + TLS + SCRAM handshake to the
   * pooler before the first query could be sent.
   *
   * But 300 was not a bigger version of 20 — it was exactly the ceiling. An
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
   * 30s keeps a list -> detail -> back loop on one connection (that loop is
   * seconds, not minutes) with an order of magnitude of headroom under the
   * ceiling. Raising this again means checking the function's maxDuration
   * first, and leaving real margin: the socket, not the query, is what holds
   * the invocation open.
   *
   * `prepare` is deliberately left unset. postgres-js then uses named prepared
   * statements, which Supavisor supports in transaction mode and which is the
   * FASTER path — setting `prepare: false` for the transaction pooler is a
   * robustness change that costs performance, not a speedup.
   */
  idle_timeout: 30,
  connect_timeout: 10,
});
export const db = drizzle(client, { schema });
