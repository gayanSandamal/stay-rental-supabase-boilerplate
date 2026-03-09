import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { client } from './drizzle';

async function runMigration() {
  const migrationPath = join(
    process.cwd(),
    'lib/db/migrations/0001_stay_rental_transformation.sql'
  );
  const sql = readFileSync(migrationPath, 'utf-8');

  // Split by statement-breakpoint and execute each statement
  const statements = sql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  for (const statement of statements) {
    if (statement.trim()) {
      try {
        await client.unsafe(statement);
        console.log('✓ Executed statement');
      } catch (error: any) {
        // Ignore "already exists" errors
        if (
          error?.message?.includes('already exists') ||
          error?.message?.includes('duplicate')
        ) {
          console.log('⚠ Skipped (already exists)');
        } else {
          console.error('✗ Error:', error?.message);
          throw error;
        }
      }
    }
  }

  console.log('Migration completed!');
  process.exit(0);
}

runMigration().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});

