import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { client } from './drizzle';

const MIGRATIONS = [
  '0001_stay_rental_transformation.sql',
  '0002_business_accounts.sql',
  '0003_add_rejection_fields.sql',
  '0004_contact_numbers.sql',
  '0005_listing_expiration.sql',
  '0006_contact_verification.sql',
  '0007_audit_log.sql',
  '0008_password_reset_tokens.sql',
  '0009_search_fts.sql',
  '0010_notifications.sql',
  '0011_user_subscription.sql',
  '0012_leads_premium_listings_exclusive.sql',
  '0013_saved_searches_last_alert.sql',
  '0014_drop_leads_viewings.sql',
  '0015_landlord_plan_tier.sql',
  '0016_listing_boost_featured.sql',
  '0017_listing_views.sql',
  '0018_landlord_profile_slug.sql',
  '0019_add_auth_user_id.sql',
  '0020_auth_user_trigger.sql',
];

function splitStatements(sql: string): string[] {
  const results: string[] = [];
  let current = '';
  let inDollarBlock = false;

  for (const line of sql.split('\n')) {
    const trimmed = line.trim();

    // Skip empty lines and pure comments
    if (!trimmed || trimmed.startsWith('--')) {
      current += line + '\n';
      continue;
    }

    // Detect DO $$ blocks
    if (/DO\s+\$\$/.test(trimmed)) {
      inDollarBlock = true;
    }

    current += line + '\n';

    // End of $$ block
    if (inDollarBlock && /END\s+\$\$\s*;?\s*$/.test(trimmed)) {
      inDollarBlock = false;
      results.push(current.trim());
      current = '';
      continue;
    }

    // Normal statement end (only if not inside $$ block)
    if (!inDollarBlock && trimmed.endsWith(';')) {
      results.push(current.trim());
      current = '';
    }
  }

  if (current.trim()) {
    results.push(current.trim());
  }

  return results.filter(
    (s) => s.length > 0 && !s.split('\n').every((l) => !l.trim() || l.trim().startsWith('--'))
  );
}

async function runAll() {
  for (const file of MIGRATIONS) {
    console.log(`\n── ${file} ──`);
    const path = join(process.cwd(), 'lib/db/migrations', file);
    const sql = readFileSync(path, 'utf-8');
    const stmts = splitStatements(sql);

    for (const stmt of stmts) {
      try {
        await client.unsafe(stmt);
        console.log('  ✓ OK');
      } catch (error: any) {
        const msg = error?.message || '';
        if (
          msg.includes('already exists') ||
          msg.includes('duplicate') ||
          msg.includes('multiple primary keys')
        ) {
          console.log('  ⏭ Skipped (already exists)');
        } else {
          console.error('  ✗ Error:', msg);
          console.error('  Statement:', stmt.substring(0, 120) + '…');
          throw error;
        }
      }
    }
    console.log(`  ✅ Done`);
  }

  console.log('\n🎉 All migrations applied to Supabase!\n');
  process.exit(0);
}

runAll().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
