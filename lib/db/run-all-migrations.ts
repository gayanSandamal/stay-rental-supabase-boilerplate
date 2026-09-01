import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
  '0021_featured_urgent_until.sql',
  '0022_landlord_included_boosts.sql',
  '0023_sync_featured_with_featured_until.sql',
  '0024_audit_visibility_actions.sql',
  '0025_feature_flags.sql',
  '0026_enable_rls.sql',
  '0027_whatsapp_intake.sql',
  '0028_intake_channel.sql',
  '0029_intake_unsupported_media.sql',
  '0030_wa_landlord_accounts.sql',
  '0031_auth_user_trigger_hardening.sql',
  '0032_listing_moderation.sql',
  '0033_intake_location_pin.sql',
  '0034_moderation_coverage.sql',
  '0035_listing_landlord_notified.sql',
  '0036_listing_address_optional.sql',
  '0037_locations.sql',
  '0038_intake_city_override.sql',
  '0039_phone_verifications.sql',
  '0040_listing_social_posts.sql',
  '0041_social_results_notice.sql',
  '0042_reply_language.sql',
  '0043_intake_conversation_memory.sql',
  '0044_social_manual_takedown.sql',
  '0045_listing_contact_events.sql',
  '0046_listing_view_visitor.sql',
  '0047_market_rent_snapshots.sql',
  '0048_listing_impressions.sql',
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

    // Detect DO $$ or AS $$ blocks (function/trigger bodies)
    if (/DO\s+\$\$/.test(trimmed) || /AS\s+\$\$/.test(trimmed)) {
      inDollarBlock = true;
    }

    current += line + '\n';

    // End of $$ block (line is just $$ or $$;)
    if (inDollarBlock && /^\s*\$\$;?\s*$/.test(trimmed)) {
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

const MIGRATIONS_DIR = join(process.cwd(), 'lib/db/migrations');

/**
 * Files in lib/db/migrations/ that this runner is NOT supposed to apply.
 *
 * `0000` belongs to drizzle-kit, not to us — it is the inherited
 * nextjs/saas-starter baseline (activity_logs, team_id, …), it is recorded in
 * meta/_journal.json, and it is applied by `pnpm db:migrate`. The hand-rolled
 * runner deliberately starts at 0001.
 *
 * Anything NOT listed here and NOT in MIGRATIONS is a mistake, not a choice.
 */
const NOT_RUN_BY_THIS_RUNNER = new Set(['0000_soft_the_anarchist.sql']);

/**
 * Fail before touching the database if the manifest and the directory disagree.
 *
 * Both directions have bitten this repo:
 *
 * - REGISTERED BUT MISSING — `readFileSync` throws a bare ENOENT partway through
 *   the run, so every migration numbered after the missing one silently never
 *   applies. That is what an uncommitted `.sql` file looks like from a fresh
 *   clone: it works on the author's machine and nowhere else.
 * - PRESENT BUT UNREGISTERED — the file simply never runs. The schema drifts
 *   from `schema.ts`, and because Drizzle names every column explicitly, the
 *   first read of that table 500s in production.
 */
function checkManifest() {
  const missing = MIGRATIONS.filter((f) => !existsSync(join(MIGRATIONS_DIR, f)));
  if (missing.length > 0) {
    console.error('\n✗ Registered in MIGRATIONS but not on disk:');
    for (const f of missing) console.error(`    ${f}`);
    console.error('\n  Nothing was applied. Commit the file(s), or remove them from');
    console.error('  the MIGRATIONS array in lib/db/run-all-migrations.ts.\n');
    process.exit(1);
  }

  const registered = new Set(MIGRATIONS);
  const unregistered = readdirSync(MIGRATIONS_DIR)
    .filter(
      (f) => f.endsWith('.sql') && !registered.has(f) && !NOT_RUN_BY_THIS_RUNNER.has(f)
    )
    .sort();
  if (unregistered.length > 0) {
    console.error('\n✗ Present in lib/db/migrations/ but NOT registered:');
    for (const f of unregistered) console.error(`    ${f}`);
    console.error('\n  These will never run. Add them to the MIGRATIONS array.\n');
    process.exit(1);
  }
}

async function runAll() {
  checkManifest();

  for (const file of MIGRATIONS) {
    console.log(`\n── ${file} ──`);
    const path = join(MIGRATIONS_DIR, file);
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
