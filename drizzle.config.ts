import type { Config } from 'drizzle-kit';
import dotenv from 'dotenv';

dotenv.config();

// Use DATABASE_URL (Supabase) or POSTGRES_URL (local)
const connectionString =
  process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error(
    'Set DATABASE_URL or POSTGRES_URL for migrations (e.g. in .env).'
  );
}

export default {
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: connectionString,
  },
} satisfies Config;
