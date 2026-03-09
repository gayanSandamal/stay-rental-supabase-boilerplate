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

export const client = postgres(connectionString);
export const db = drizzle(client, { schema });
