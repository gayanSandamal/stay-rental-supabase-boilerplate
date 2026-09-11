/**
 * Owner consent for an imported advert. The importer is OPT-IN (migration 0060).
 *
 * WHAT CHANGED AND WHY. The old flow published the property and told the owner
 * afterwards, with "reply REMOVE" as the escape hatch. That is defensible only
 * as long as the removal really is one tap — and it was not: the notice reached
 * nobody, because the only code path that sent it belonged to the moderation
 * sweeper while operators were approving by hand. An opt-out model whose opt-out
 * never arrives is just publishing someone's property without asking. So the
 * question moved to the front, where it cannot silently fail to be asked.
 *
 * SILENCE IS A NO. There is no timeout that publishes anyway. An import with no
 * answer stays `awaiting_consent` forever, and that is the EXPECTED terminal
 * state for most of them — people do not reply to businesses they have never
 * heard of. The importer is no longer a way to seed the marketplace in bulk; it
 * is a way to recruit landlords who actively said yes.
 *
 * ONE YES COVERS BOTH the website and Easy Rent's own social accounts, because
 * that is what the template asks for by name. It is recorded as
 * `socialConsentSource: 'whatsapp'` — the owner really was asked, which is the
 * first time that has been true for an imported listing. `'ops'` stays the
 * honest label only where an operator decided alone.
 *
 * THE PREVIEW TOKEN IS NOT AN ACCESS LINK. Both live under `/l/`, because the
 * approved template's button base cannot change, but this one mints no session
 * and grants nothing: it resolves to a read-only render of what we are asking
 * to publish. Handing someone a signed-in session before they have agreed to
 * anything would be the wrong default, and sha256-only storage matches the rule
 * lib/auth/access-links.ts already follows.
 */

import crypto from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { postImports, type PostImport } from '@/lib/db/schema';
import { logAudit } from '@/lib/db/audit-logger';
import { isFeatureEnabled } from '@/lib/feature-flags';
import {
  sendWhatsAppTemplate,
  whatsappTemplateName,
} from '@/lib/intake/channels/whatsapp/send';
import { setConversation } from '@/lib/intake/commands';
import { consentTemplateParams, renderConsentText } from './message';

export type ConsentOutcome = 'sent' | 'dry_run' | 'failed';

/**
 * How long a typed YES is still understood as answering this question.
 *
 * Far longer than the social prompt's 24 hours, and it can afford to be:
 * silence never publishes anything, so a stale state costs nothing, while an
 * expired one costs a genuine yes. Someone who opens the preview link, thinks
 * about it for a fortnight and replies YES means it exactly as much as someone
 * who answers in a minute. Past this the reply falls through to ordinary intake
 * handling and an operator picks it up from the ops queue.
 */
export const IMPORT_CONSENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL || 'https://easyrent.lk';
}

export function hashConsentToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * The authorisation check every publish path must make.
 *
 * Deliberately a throw and not a boolean. A caller that forgets to read a
 * boolean publishes; a caller that forgets to catch this does not. Publishing
 * someone's property without permission is the failure this whole module exists
 * to prevent, so it fails closed and loudly.
 */
export class ImportConsentError extends Error {}

export function assertImportConsent(record: Pick<PostImport, 'consentGrantedAt'>): void {
  if (!record.consentGrantedAt) {
    throw new ImportConsentError(
      'The owner has not agreed to this listing being published. Send the consent request and wait for their reply.'
    );
  }
}

/**
 * Ask the owner. Mints the preview token, sends the template, and moves the
 * import to `awaiting_consent`. Creates NOTHING public.
 *
 * Never throws: the import row already exists by the time this runs, and a
 * messaging failure must leave it askable again rather than wedged.
 */
export async function requestImportConsent(
  record: PostImport,
  opsUserId: number
): Promise<{ outcome: ConsentOutcome; previewUrl: string }> {
  const token = crypto.randomBytes(32).toString('base64url');
  const previewUrl = `${baseUrl()}/l/${token}`;
  const ownerPhone = record.ownerPhone ?? '';

  const params = consentTemplateParams({
    ownerName: record.ownerName,
    listingTitle: titleOf(record),
    ownerPhone,
  });
  const body = renderConsentText(params, previewUrl);

  const templateName = whatsappTemplateName('consent');
  let outcome: ConsentOutcome = 'dry_run';

  if (!isFeatureEnabled('notifyImportedOwners')) {
    // Same deliberate silence as the notice: an operator working through a
    // backlog may not want a hundred cold messages going out behind them.
    // Under opt-in this also means nothing can ever publish, which is the safe
    // direction for a flag that is off.
    console.log(`[imports:dryrun] consent to=${ownerPhone} (notifyImportedOwners off)`);
  } else if (templateName && ownerPhone) {
    const delivered = await sendWhatsAppTemplate(ownerPhone, {
      name: templateName,
      bodyParams: params,
      // Base URL is baked into the approved template; only the token varies.
      urlButtonParam: token,
    });
    outcome = delivered ? 'sent' : 'failed';
  } else {
    console.log(
      `[imports:dryrun] consent to=${ownerPhone} ` +
        `(${templateName ? 'no owner phone' : 'no WHATSAPP_CONSENT_TEMPLATE'})\n${body}`
    );
  }

  /*
   * The token hash is stored even on a dry run or a failure. The preview link
   * is in the rendered body an operator can read and resend by hand, and a
   * token that resolves to nothing would make that copy a dead link. It grants
   * no access on its own — consent still requires a reply.
   *
   * A DRY RUN IS NOT AN ASK, and must not be recorded as one.
   *
   * `consentRequestedAt` is what `already_asked` refuses a second ask on, and
   * the reason it refuses is harassment: a second unsolicited message to
   * someone who never replied. On a dry run there was no first message —
   * `sendWhatsAppTemplate` was never called — so there is nobody to spare and
   * nothing to be silent about. Stamping it anyway made an unset
   * WHATSAPP_CONSENT_TEMPLATE **permanently** unpublishable: the ask is
   * refused forever, consent can therefore never arrive, and under opt-in the
   * listing can never go live. Setting the env var afterwards does not help,
   * because nothing re-reads these rows. Reported 2026-09-11, from a
   * production import stuck exactly this way.
   *
   * `status` is held back for the same reason. "awaiting_consent" on a row
   * where nobody was asked is the same lie as `post_imports.status =
   * 'published'` for a listing still sitting in the moderation queue.
   *
   * `failed` DOES stamp, and deliberately: Meta was called and rejected it, and
   * CLAUDE.md is explicit that repeated failed business-initiated sends degrade
   * the WABA quality rating every landlord's messages depend on. An operator
   * who fixed the number needs a deliberate unblock, not a retry button.
   */
  const reallyAsked = outcome !== 'dry_run';

  await db
    .update(postImports)
    .set({
      ...(reallyAsked ? { status: 'awaiting_consent' as const, consentRequestedAt: new Date() } : {}),
      consentOutcome: outcome,
      consentTokenHash: hashConsentToken(token),
      updatedAt: new Date(),
    })
    .where(eq(postImports.id, record.id));

  /*
   * Arm the reply. Only on a real send: parking a `confirm_import` state for a
   * message that never left would make the next thing this person says to us —
   * possibly their own listing submission, months later — read as an answer to
   * a question they were never asked.
   */
  if (outcome === 'sent' && ownerPhone) {
    await db
      .transaction(async (tx) => {
        await setConversation(
          tx,
          'whatsapp',
          ownerPhone,
          'confirm_import',
          { consentImportId: record.id },
          IMPORT_CONSENT_TTL_MS
        );
      })
      .catch((err) => console.error('[imports] arming consent reply failed', err));
  }

  await logAudit({
    action: 'post_import_published',
    entityType: 'post_import',
    entityId: record.id,
    userId: opsUserId,
    metadata: { step: 'consent_requested', outcome, sourceUrl: record.sourceUrl },
  }).catch(() => {});

  return { outcome, previewUrl };
}

/**
 * Resolve a preview token to the import it belongs to.
 *
 * Only ever matches a row still waiting for an answer: once the owner has said
 * yes or no the preview has nothing left to show, and a bearer token sitting in
 * a chat thread should stop resolving the moment it stops being needed.
 */
export async function resolveConsentToken(token: string): Promise<PostImport | null> {
  if (!token || token.length < 20) return null;
  const row = await db.query.postImports.findFirst({
    where: and(
      eq(postImports.consentTokenHash, hashConsentToken(token)),
      // NOT gated on consentRequestedAt. The hash is 32 random bytes and is
      // written nowhere but requestImportConsent, so the timestamp added no
      // security — and now that a dry run leaves it null, requiring it would
      // break the one thing the dry-run branch stores a token FOR: an operator
      // reading the composed message out of the log and sending it by hand.
      isNull(postImports.consentGrantedAt),
      isNull(postImports.consentDeclinedAt)
    ),
  });
  return row ?? null;
}

/**
 * The owner said yes. Stamps consent and hands the record back for publishing;
 * it does not publish, because the caller owns that transaction and its errors.
 *
 * Idempotent on `consentGrantedAt`: a landlord who taps YES twice, or whose
 * reply is redelivered by Meta, must not produce two listings.
 */
export async function grantImportConsent(importId: number): Promise<PostImport | null> {
  const [updated] = await db
    .update(postImports)
    .set({ consentGrantedAt: new Date(), consentSource: 'whatsapp', updatedAt: new Date() })
    .where(
      and(
        eq(postImports.id, importId),
        isNull(postImports.consentGrantedAt),
        isNull(postImports.consentDeclinedAt)
      )
    )
    .returning();
  if (!updated) return null;

  await logAudit({
    action: 'post_import_published',
    entityType: 'post_import',
    entityId: importId,
    metadata: { step: 'consent_granted', channel: 'whatsapp' },
  }).catch(() => {});

  return updated;
}

/**
 * An operator attests they got the owner's consent themselves — a phone call,
 * a WhatsApp chat outside the template flow — and publishing may proceed
 * without the approved consent template. Gated behind `allowManualImportConsent`
 * (checked by the caller, not here — same split as every other flag check in
 * this codebase) for when the template is not yet registered with Meta, or an
 * operator simply prefers to call.
 *
 * `assertImportConsent` in publishImport() does not change: it still only ever
 * checks `consentGrantedAt`. This is a second, audited way to set that same
 * column — never a bypass of the check itself — which is why `consentSource`
 * exists: `publishImport()` reads it back to label `socialConsentSource` and
 * the audit trail honestly, since the owner was never actually asked by OUR
 * template on this path.
 *
 * Idempotent on `consentGrantedAt`, same as `grantImportConsent` — a double
 * click must not produce two listings.
 */
export async function grantManualImportConsent(
  importId: number,
  opsUserId: number
): Promise<PostImport | null> {
  const [updated] = await db
    .update(postImports)
    .set({ consentGrantedAt: new Date(), consentSource: 'manual', updatedAt: new Date() })
    .where(
      and(
        eq(postImports.id, importId),
        isNull(postImports.consentGrantedAt),
        isNull(postImports.consentDeclinedAt)
      )
    )
    .returning();
  if (!updated) return null;

  await logAudit({
    action: 'post_import_published',
    entityType: 'post_import',
    entityId: importId,
    userId: opsUserId,
    metadata: { step: 'consent_granted', channel: 'manual' },
  }).catch(() => {});

  return updated;
}

/**
 * The owner said no. The message promised we would delete everything we hold,
 * so the extracted advert is wiped rather than merely flagged — the row survives
 * only as a tombstone keyed on the source URL, so the same advert cannot be
 * imported and the same person asked a second time.
 */
export async function declineImportConsent(importId: number): Promise<void> {
  await db
    .update(postImports)
    .set({
      status: 'declined',
      consentDeclinedAt: new Date(),
      // "We will delete everything we hold" has to be true, or the next
      // sentence of that message is worthless.
      rawText: null,
      parsedPayload: null,
      photoUrls: null,
      ownerName: null,
      consentTokenHash: null,
      updatedAt: new Date(),
    })
    .where(eq(postImports.id, importId));

  await logAudit({
    action: 'post_import_published',
    entityType: 'post_import',
    entityId: importId,
    metadata: { step: 'consent_declined', channel: 'whatsapp' },
  }).catch(() => {});
}

/** The advert's title, for the ask. Kept next to the parse so both agree. */
function titleOf(record: PostImport): string {
  try {
    const parsed = record.parsedPayload ? JSON.parse(record.parsedPayload) : null;
    const title = parsed && typeof parsed === 'object' ? parsed.title : null;
    return typeof title === 'string' && title.trim() ? title.trim() : 'your property';
  } catch {
    return 'your property';
  }
}
