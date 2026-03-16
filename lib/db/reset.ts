import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { client } from './drizzle';

const DROP_SQL = `
-- Drop materialized view first (depends on listings)
DROP MATERIALIZED VIEW IF EXISTS "search_location_suggestions" CASCADE;

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS "listing_contact_numbers" CASCADE;
DROP TABLE IF EXISTS "user_contact_numbers" CASCADE;
DROP TABLE IF EXISTS "listing_views" CASCADE;
DROP TABLE IF EXISTS "viewings" CASCADE;
DROP TABLE IF EXISTS "leads" CASCADE;
DROP TABLE IF EXISTS "saved_searches" CASCADE;
DROP TABLE IF EXISTS "audit_logs" CASCADE;
DROP TABLE IF EXISTS "password_reset_tokens" CASCADE;
DROP TABLE IF EXISTS "notifications" CASCADE;
DROP TABLE IF EXISTS "listings" CASCADE;
DROP TABLE IF EXISTS "business_account_members" CASCADE;
DROP TABLE IF EXISTS "landlords" CASCADE;
DROP TABLE IF EXISTS "business_accounts" CASCADE;
DROP TABLE IF EXISTS "activity_logs" CASCADE;
DROP TABLE IF EXISTS "invitations" CASCADE;
DROP TABLE IF EXISTS "team_members" CASCADE;
DROP TABLE IF EXISTS "teams" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;

-- Drop enums
DROP TYPE IF EXISTS "audit_action" CASCADE;
DROP TYPE IF EXISTS "business_account_status" CASCADE;
DROP TYPE IF EXISTS "lead_status" CASCADE;
DROP TYPE IF EXISTS "listing_status" CASCADE;
DROP TYPE IF EXISTS "user_role" CASCADE;
`;

async function reset() {
  console.log('🔄 Resetting database...\n');

  const statements = DROP_SQL.split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  for (const stmt of statements) {
    if (!stmt) continue;
    try {
      await client.unsafe(stmt + ';');
      const tableMatch = stmt.match(/DROP TABLE IF EXISTS "([^"]+)"/);
      const typeMatch = stmt.match(/DROP TYPE IF EXISTS "([^"]+)"/);
      const viewMatch = stmt.match(/DROP MATERIALIZED VIEW IF EXISTS "([^"]+)"/);
      const name = tableMatch?.[1] ?? typeMatch?.[1] ?? viewMatch?.[1] ?? 'object';
      console.log(`  ✓ Dropped ${name}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('does not exist')) {
        console.log(`  ⏭ Skipped (already gone)`);
      } else {
        throw err;
      }
    }
  }

  console.log('\n🔄 Re-running migrations...\n');

  const MIGRATIONS = [
    '0000_soft_the_anarchist.sql',
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
  ];

  function splitStatements(sql: string): string[] {
    const results: string[] = [];
    let current = '';
    let inDollarBlock = false;

    for (const line of sql.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('--')) {
        current += line + '\n';
        continue;
      }
      if (/DO\s+\$\$/.test(trimmed)) inDollarBlock = true;
      current += line + '\n';
      if (inDollarBlock && /END\s+\$\$\s*;?\s*$/.test(trimmed)) {
        inDollarBlock = false;
        results.push(current.trim());
        current = '';
        continue;
      }
      if (!inDollarBlock && trimmed.endsWith(';')) {
        results.push(current.trim());
        current = '';
      }
    }
    if (current.trim()) results.push(current.trim());
    return results.filter(
      (s) => s.length > 0 && !s.split('\n').every((l) => !l.trim() || l.trim().startsWith('--'))
    );
  }

  for (const file of MIGRATIONS) {
    console.log(`  ── ${file}`);
    const filePath = join(process.cwd(), 'lib/db/migrations', file);
    const sql = readFileSync(filePath, 'utf-8');
    const stmts = splitStatements(sql);

    for (const stmt of stmts) {
      try {
        await client.unsafe(stmt);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes('already exists') ||
          msg.includes('duplicate') ||
          msg.includes('multiple primary keys')
        ) {
          // skip
        } else {
          throw err;
        }
      }
    }
  }

  console.log('\n✅ Database reset complete. Fresh schema applied.\n');
  console.log('Seed if needed:\n');
  console.log('   npm run db:seed\n');
  console.log('   npm run db:seed-sample-data\n');
}

reset()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Reset failed:', err);
    process.exit(1);
  });
