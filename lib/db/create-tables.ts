import { client } from './drizzle';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

async function createTables() {
  const migrationPath = join(
    process.cwd(),
    'lib/db/migrations/0001_stay_rental_transformation.sql'
  );
  const sql = readFileSync(migrationPath, 'utf-8');

  // Execute the entire SQL file
  try {
    await client.unsafe(sql);
    console.log('✅ All tables created successfully');
  } catch (error: any) {
    // Ignore "already exists" errors
    if (
      error?.message?.includes('already exists') ||
      error?.message?.includes('duplicate')
    ) {
      console.log('⚠ Some tables may already exist, continuing...');
    } else {
      console.error('Error creating tables:', error?.message);
      throw error;
    }
  }
  process.exit(0);
}

createTables().catch((error) => {
  console.error('Failed to create tables:', error);
  process.exit(1);
});

