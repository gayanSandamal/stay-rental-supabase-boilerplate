import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '../lib/db/drizzle';
import { postImports } from '../lib/db/schema';

/**
 * Let an import be asked again after a consent request that was never sent.
 *
 * `requestImportConsent` used to stamp `consent_requested_at` whatever the
 * outcome. `already_asked` refuses a second ask on that timestamp, so an import
 * whose ask went nowhere — no `WHATSAPP_CONSENT_TEMPLATE`, or
 * `notifyImportedOwners` off — became **permanently** unpublishable: the ask is
 * refused forever, consent can never arrive, and the importer is opt-in.
 * Setting the env var afterwards does not help, because nothing re-reads these
 * rows. That is fixed going forward; this is the one-off repair for the rows
 * already stamped.
 *
 * WHAT IT WILL NOT TOUCH:
 *
 *  - `consent_outcome <> 'dry_run'`. A `sent` row reached a real person and
 *    asking again is the harassment `already_asked` exists to prevent. A
 *    `failed` row reached META, and CLAUDE.md is explicit that repeated failed
 *    business-initiated sends degrade the WABA quality rating every landlord's
 *    messages depend on — unblocking those is a judgement call for a human,
 *    made one row at a time.
 *  - Anything already answered. A granted or declined row has its reply; the
 *    question is closed either way, and a NO has had its content wiped.
 *
 * `consent_outcome` and `consent_token_hash` are left in place, so the audit
 * trail still shows the attempt and the composed preview link still resolves.
 *
 * Runs against whatever DATABASE_URL points at — usually PRODUCTION. It sends
 * nothing and publishes nothing; it only lets an operator ask a question that
 * was never asked. Listing mode (no arguments) is read-only.
 *
 *   pnpm imports:unstick-consent          # list what would be cleared
 *   pnpm imports:unstick-consent --apply  # clear it
 */
async function main() {
  const apply = process.argv.includes('--apply');

  const stuck = await db.query.postImports.findMany({
    where: and(
      eq(postImports.consentOutcome, 'dry_run'),
      isNotNull(postImports.consentRequestedAt),
      isNull(postImports.consentGrantedAt),
      isNull(postImports.consentDeclinedAt)
    ),
  });

  if (!stuck.length) {
    console.log('Nothing stuck — no dry-run consent requests are blocking an ask.');
    return;
  }

  console.log(`${stuck.length} import(s) blocked by a consent request that was never sent:\n`);
  for (const row of stuck) {
    const title = titleOf(row.parsedPayload) ?? `Import #${row.id}`;
    console.log(
      `  #${row.id}  ${title}\n` +
        `      status=${row.status}  asked=${row.consentRequestedAt?.toISOString() ?? '-'}  ${row.sourceUrl}`
    );
  }

  if (!apply) {
    console.log('\nRead-only. Re-run with --apply to clear these and allow the ask.');
    return;
  }

  // Sequential, not Promise.all: the pool is max: 1 behind Supabase's
  // transaction pooler and concurrent queries on it wedge the process
  // (commit a3ac4f9). A handful of rows does not need concurrency.
  let cleared = 0;
  for (const row of stuck) {
    await db
      .update(postImports)
      .set({
        consentRequestedAt: null,
        // Back to where it was before an ask that never happened. `draft` is
        // what createImportAction writes, and what the review screen expects.
        status: 'draft',
        updatedAt: new Date(),
      })
      .where(eq(postImports.id, row.id));
    cleared++;
  }

  console.log(`\nCleared ${cleared}. They can be asked once the consent template is configured.`);
}

function titleOf(payload: string | null): string | null {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as { title?: unknown };
    return typeof parsed.title === 'string' ? parsed.title : null;
  } catch {
    return null;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit(0));
