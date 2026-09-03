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
   * Long enough that a warm instance keeps its connection between navigations.
   *
   * At 20s a low-traffic site reconnects constantly: most requests arrived on a
   * warm Lambda whose pool had already closed, so they paid a fresh TCP + TLS +
   * SCRAM handshake to the pooler before the first query could even be sent.
   * That is pure latency on the critical path, and it was being paid on most
   * navigations rather than a few.
   *
   * `prepare` is deliberately left unset. postgres-js then uses named prepared
   * statements, which Supavisor supports in transaction mode and which is the
   * FASTER path — setting `prepare: false` for the transaction pooler is a
   * robustness change that costs performance, not a speedup.
   */
  idle_timeout: 300,
  connect_timeout: 10,
});
export const db = drizzle(client, { schema });
