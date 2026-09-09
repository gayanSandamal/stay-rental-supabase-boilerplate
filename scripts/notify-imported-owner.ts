import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '../lib/db/drizzle';
import { featureFlags as featureFlagsTable, listings, postImports } from '../lib/db/schema';
import {
  applyFeatureFlagOverrides,
  featureFlagDefaults,
  isFeatureEnabled,
  type FeatureFlag,
  type FeatureFlagValue,
} from '../lib/feature-flags';
import { whatsappTemplateName } from '../lib/intake/channels/whatsapp/send';
import { notifyImportedOwnerForListing } from '../lib/imports/notify';

/**
 * Send the owner notice for imports that went live without one.
 *
 * Every path to `active` now sends it, but listings published BEFORE that fix
 * are owed a message nothing will ever retry: `post_imports.notified_at` stays
 * null and no job reads the row again. This is the one-off repair.
 *
 * WHY IT RESOLVES FLAGS ITSELF. `isFeatureEnabled` reads a per-instance
 * snapshot that starts at the compiled defaults, and `notifyImportedOwners`
 * defaults to FALSE. A script that never applies the DB overrides therefore
 * takes the dry-run branch and reports "notifyImportedOwners off" against
 * production where the flag is plainly on — unfinished setup claimed for a flag
 * that is finished, the same lie as reporting a send that never happened.
 *
 * It cannot call `loadFeatureFlags()` to do that: `lib/feature-flags-store.ts`
 * opens with `import 'server-only'`, whose default export throws outside a
 * React Server Component — which is every plain `tsx` process, this one
 * included. So the two table columns are read here and pushed through
 * `applyFeatureFlagOverrides`, which is the same thing the store does with the
 * same rows, minus the TTL cache that a one-shot script has no use for.
 *
 * WHY IT WILL ONLY TOUCH ACTIVE LISTINGS. The template says the property "is
 * now listed" and links to it. Firing it at a pending or rejected listing
 * describes something the owner cannot see.
 *
 * Runs against whatever DATABASE_URL points at — usually PRODUCTION, and this
 * sends real WhatsApp messages to third parties who have never contacted us.
 * Listing is therefore the default; sending needs an explicit id or --all.
 */
/**
 * Merge the `feature_flags` rows onto the compiled defaults, exactly as
 * `refresh()` in lib/feature-flags-store.ts does. Unknown keys are ignored so a
 * flag deleted from the code cannot resurrect itself from an old row.
 */
async function resolveFlagsFromDb(): Promise<void> {
  const rows = await db.select().from(featureFlagsTable);
  const overrides: Partial<Record<FeatureFlag, FeatureFlagValue>> = {};
  for (const row of rows) {
    if (!Object.prototype.hasOwnProperty.call(featureFlagDefaults, row.key)) continue;
    const key = row.key as FeatureFlag;
    const def = featureFlagDefaults[key];
    if (typeof def === 'number') {
      const n = Number(row.value);
      overrides[key] = Number.isFinite(n) ? n : def;
    } else {
      overrides[key] = row.value === 'true';
    }
  }
  applyFeatureFlagOverrides(overrides);
}

async function main() {
  const arg = process.argv[2]?.trim();
  await resolveFlagsFromDb();

  const owed = await db
    .select({
      importId: postImports.id,
      listingId: postImports.listingId,
      ownerPhone: postImports.ownerPhone,
      ownerName: postImports.ownerName,
      sourceUrl: postImports.sourceUrl,
      title: listings.title,
      status: listings.status,
    })
    .from(postImports)
    .innerJoin(listings, eq(listings.id, postImports.listingId))
    .where(
      and(
        eq(postImports.status, 'published'),
        isNotNull(postImports.listingId),
        isNull(postImports.notifiedAt),
        eq(listings.status, 'active')
      )
    );

  if (!owed.length) {
    console.log('No published imports are owed an owner notice.');
    process.exit(0);
  }

  if (!arg) {
    console.log(`${owed.length} live import(s) whose owner was never told:\n`);
    for (const row of owed) {
      console.log(
        `  listing #${row.listingId}  ${row.ownerPhone ?? '(no phone)'}  ${row.title}\n` +
          `    import #${row.importId}  ${row.sourceUrl}`
      );
    }
    console.log(
      `\nSend one:  npx tsx scripts/notify-imported-owner.ts <listingId>` +
        `\nSend all:  npx tsx scripts/notify-imported-owner.ts --all`
    );
    process.exit(0);
  }

  const targets =
    arg === '--all' ? owed : owed.filter((row) => row.listingId === Number(arg));

  if (!targets.length) {
    console.error(
      `Listing ${arg} is not a live import awaiting a notice. Run with no arguments to see what is.`
    );
    process.exit(1);
  }

  /*
   * REFUSE rather than dry-run. notifyImportedOwnerForListing stamps
   * notified_at whatever the outcome — right for the live paths, where a
   * snapshot is not a ledger, and wrong here: a dry run would mark these owners
   * told, drop them out of the query above, and leave nothing that ever retries.
   * The one repair we have would be spent sending nothing.
   */
  const blocked: string[] = [];
  if (!isFeatureEnabled('notifyImportedOwners')) blocked.push('notifyImportedOwners is OFF');
  if (!whatsappTemplateName('import')) blocked.push('WHATSAPP_IMPORT_TEMPLATE is not set');
  if (blocked.length) {
    console.error(
      `Refusing to send: ${blocked.join(' and ')}.\n` +
        'These rows would take the dry-run branch, be stamped as notified anyway,\n' +
        'and never be retried. Fix that first, then re-run.'
    );
    process.exit(1);
  }

  for (const row of targets) {
    // Never null here — the query requires it — but the column is nullable.
    if (row.listingId == null) continue;
    const outcome = await notifyImportedOwnerForListing(row.listingId);
    console.log(
      `listing #${row.listingId}  ${row.ownerPhone ?? '-'}  →  ${outcome ?? 'no import record'}`
    );
  }

  // `failed` is WhatsApp rejecting the send — a real outage worth chasing, and
  // distinct from setup that was never finished (refused above).
  console.log('\nAny row reading failed was rejected by WhatsApp; check the number and the template.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
