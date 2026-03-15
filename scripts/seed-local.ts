/**
 * Full local database setup: reset + seed + sample data.
 * Targets Docker Postgres at localhost:54323.
 *
 * Usage: pnpm db:seed-local
 */
import { execSync } from 'node:child_process';

const LOCAL_URL = 'postgresql://postgres:postgres@localhost:54323/postgres';
const env = { ...process.env, DATABASE_URL: LOCAL_URL };

console.log('📦 Using local Docker Postgres (localhost:54323)\n');

console.log('🔄 Step 1: Resetting database...');
execSync('npx tsx lib/db/reset.ts', { env, stdio: 'inherit' });

console.log('\n🌱 Step 2: Seeding base data (admin, ops, tenant, landlord)...');
execSync('npx tsx lib/db/seed.ts', { env, stdio: 'inherit' });

console.log('\n🌱 Step 3: Seeding sample data (~1300 records)...');
execSync('npx tsx lib/db/seed-sample-data.ts', { env, stdio: 'inherit' });

console.log('\n✅ Local seeding complete!');
