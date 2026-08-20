/**
 * Bulk-wipe user accounts and everything hanging off them, keeping an explicit
 * allow-list. For clearing pre-launch/test accounts off an environment.
 *
 *   pnpm db:wipe-users --keep admin.g@easyrent.lk              # dry run
 *   pnpm db:wipe-users --keep admin.g@easyrent.lk --confirm    # actually delete
 *
 * This is `scripts/hard-delete-user.ts` applied to many accounts at once, plus
 * the two things that script leaves behind: orphaned storage objects, and a
 * refusal to strand the platform without an admin.
 *
 * DRY RUN IS THE DEFAULT. Nothing is destroyed without --confirm.
 *
 * Three traps this exists to handle, all found the hard way:
 *
 * 1. `DELETE FROM users` simply FAILS. Twelve foreign keys into `users` are
 *    NO ACTION, not CASCADE — audit_logs above all. Those references have to be
 *    nulled first, in order, or Postgres refuses the delete outright.
 * 2. Deleting only `public.users` SILENTLY UNDOES ITSELF. Supabase Auth is a
 *    separate table; leave a row there and the migration-0020 trigger recreates
 *    the public row the next time that person signs in. The wipe looks like it
 *    worked and quietly reverses.
 * 3. Listing photos live in Supabase Storage, not the database. Deleting the
 *    listing row leaves the image bytes paid for and unreferenced forever.
 *
 * Requires DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import { inArray, or } from 'drizzle-orm';
import { db } from '../lib/db/drizzle';
import {
  auditLogs,
  businessAccounts,
  featureFlags,
  landlords,
  listings,
  savedSearches,
  userContactNumbers,
  users,
} from '../lib/db/schema';
import { getSupabaseAdmin, STORAGE_BUCKET } from '../lib/supabase';
import { parsePhotos } from '../lib/images/manifest';

interface Args {
  keep: string[];
  confirm: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const keep: string[] = [];
  let confirm = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--keep') {
      const v = argv[++i];
      if (!v) fail('--keep needs an email address');
      keep.push(v.trim().toLowerCase());
    } else if (argv[i] === '--confirm') {
      confirm = true;
    } else {
      fail(`Unknown argument: ${argv[i]}`);
    }
  }
  // No default allow-list on purpose. Forgetting --keep should not be the same
  // keystroke as deleting every account you have.
  if (keep.length === 0) {
    fail('Refusing to run without --keep. Pass at least one email to preserve.');
  }
  return { keep, confirm };
}

function fail(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  console.error('Usage: pnpm db:wipe-users --keep <email> [--keep <email>…] [--confirm]\n');
  process.exit(1);
}

/** Storage paths for a set of listings, derived from their public photo URLs. */
function storagePathsFor(rows: Array<{ photos: string | null }>): string[] {
  const marker = `/${STORAGE_BUCKET}/`;
  const paths: string[] = [];
  for (const row of rows) {
    for (const url of parsePhotos(row.photos)) {
      const at = url.indexOf(marker);
      if (at === -1) continue; // externally hosted — not ours to delete
      const path = url.slice(at + marker.length).split('?')[0];
      if (path) paths.push(decodeURIComponent(path));
    }
  }
  return [...new Set(paths)];
}

async function main() {
  const { keep, confirm } = parseArgs();

  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    fail('DATABASE_URL or POSTGRES_URL is required');
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    fail('SUPABASE_SERVICE_ROLE_KEY is required — without it auth.users survives the wipe');
  }

  const target = new URL(process.env.DATABASE_URL ?? process.env.POSTGRES_URL!);
  console.log(`\nTarget:  ${target.hostname}:${target.port || 5432}${target.pathname}`);
  console.log(`Keeping: ${keep.join(', ')}`);
  console.log(confirm ? 'Mode:    LIVE — this will delete\n' : 'Mode:    dry run\n');

  const all = await db.select().from(users);
  const kept = all.filter((u) => keep.includes(u.email.toLowerCase()));
  const doomed = all.filter((u) => !keep.includes(u.email.toLowerCase()));

  for (const email of keep) {
    if (!kept.some((u) => u.email.toLowerCase() === email)) {
      fail(`--keep ${email} matches no account. Check the spelling before running this.`);
    }
  }
  if (doomed.length === 0) {
    console.log('Nothing to delete.\n');
    process.exit(0);
  }

  // The guard that the 0001 incident earned (see CLAUDE.md): never leave the
  // platform with nobody who can reach the back office.
  const survivingStaff = kept.filter((u) => u.role === 'admin' || u.role === 'ops');
  if (survivingStaff.length === 0) {
    fail(
      'This would delete every admin/ops account and lock you out of the back office. ' +
        'Add the admin to --keep.'
    );
  }

  const doomedIds = doomed.map((u) => u.id);
  const landlordRows = await db
    .select()
    .from(landlords)
    .where(inArray(landlords.userId, doomedIds));
  const landlordIds = landlordRows.map((l) => l.id);
  const listingRows = landlordIds.length
    ? await db
        .select({ id: listings.id, title: listings.title, photos: listings.photos })
        .from(listings)
        .where(inArray(listings.landlordId, landlordIds))
    : [];
  const photoPaths = storagePathsFor(listingRows);

  console.log(`Accounts to delete (${doomed.length}):`);
  for (const u of doomed) {
    const flags = [
      u.role,
      u.waPhone ? 'WhatsApp-verified' : null,
      u.authUserId ? 'can sign in' : 'no auth login',
    ]
      .filter(Boolean)
      .join(', ');
    console.log(`  #${String(u.id).padEnd(4)} ${u.email.padEnd(40)} (${flags})`);
  }
  console.log(`\nCascade: ${landlordRows.length} landlord record(s), ${listingRows.length} listing(s), ${photoPaths.length} stored photo(s)`);
  console.log(`Preserved: ${kept.map((u) => `#${u.id} ${u.email}`).join(', ')}\n`);

  if (!confirm) {
    console.log('Dry run — nothing was changed. Re-run with --confirm to execute.\n');
    process.exit(0);
  }

  // ---- destructive from here -------------------------------------------------

  // 1. Storage first. If this fails we have not yet dropped the rows that tell
  //    us which objects to remove, so the operation stays retryable.
  if (photoPaths.length) {
    const supabase = getSupabaseAdmin();
    // remove() caps per call; chunk rather than trusting one big request.
    for (let i = 0; i < photoPaths.length; i += 100) {
      const chunk = photoPaths.slice(i, i + 100);
      const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(chunk);
      if (error) console.error(`  ! storage delete failed for ${chunk.length} object(s): ${error.message}`);
    }
    console.log(`  Deleted ${photoPaths.length} storage object(s)`);
  }

  // 2. Listings, then the landlord records they point at.
  if (landlordIds.length) {
    const gone = await db
      .delete(listings)
      .where(inArray(listings.landlordId, landlordIds))
      .returning({ id: listings.id });
    console.log(`  Deleted ${gone.length} listing(s)`);
    await db.delete(landlords).where(inArray(landlords.id, landlordIds));
    console.log(`  Deleted ${landlordIds.length} landlord record(s)`);
  }

  await db.delete(savedSearches).where(inArray(savedSearches.userId, doomedIds));

  // 3. Null every NO ACTION reference. Without this the delete below throws.
  //    Note these targets can belong to KEPT users too (an admin who verified
  //    someone else's listing), so they are matched on the doomed ids only.
  await db
    .update(businessAccounts)
    .set({ createdBy: null })
    .where(inArray(businessAccounts.createdBy, doomedIds));
  await db
    .update(listings)
    .set({ verifiedBy: null, visitedBy: null, rejectedBy: null, createdBy: null })
    .where(
      or(
        inArray(listings.verifiedBy, doomedIds),
        inArray(listings.visitedBy, doomedIds),
        inArray(listings.rejectedBy, doomedIds),
        inArray(listings.createdBy, doomedIds)
      )
    );
  await db
    .update(landlords)
    .set({ kycVerifiedBy: null })
    .where(inArray(landlords.kycVerifiedBy, doomedIds));
  await db
    .update(userContactNumbers)
    .set({ verifiedBy: null })
    .where(inArray(userContactNumbers.verifiedBy, doomedIds));
  await db
    .update(featureFlags)
    .set({ updatedBy: null })
    .where(inArray(featureFlags.updatedBy, doomedIds));
  // The audit trail deliberately OUTLIVES the account — the row stays, only the
  // attribution is dropped. Same choice hard-delete-user.ts makes.
  await db.update(auditLogs).set({ userId: null }).where(inArray(auditLogs.userId, doomedIds));
  console.log('  Nulled out references');

  // 4. public.users. Cascades notifications, contact numbers, access tokens,
  //    phone_verifications, business_account_members, password_reset_tokens.
  await db.delete(users).where(inArray(users.id, doomedIds));
  console.log(`  Deleted ${doomedIds.length} row(s) from public.users`);

  // 5. Supabase Auth. Skipping this is what makes a wipe silently reverse.
  const supabase = getSupabaseAdmin();
  let authDeleted = 0;
  for (const u of doomed) {
    if (!u.authUserId) continue;
    const { error } = await supabase.auth.admin.deleteUser(u.authUserId);
    if (error) console.error(`  ! auth delete failed for ${u.email}: ${error.message}`);
    else authDeleted++;
  }
  console.log(`  Deleted ${authDeleted} auth.users row(s)`);

  console.log('\n✓ Wipe complete.\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFailed:', err);
  process.exit(1);
});
