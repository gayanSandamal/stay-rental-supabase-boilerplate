'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { postImports } from '@/lib/db/schema';
import { logAudit } from '@/lib/db/audit-logger';
import { getUser } from '@/lib/db/queries';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { normalizePhone } from '@/lib/auth/phone-verification';
import {
  resolveFromPastedText,
  resolvePost,
  UnsupportedUrlError,
} from '@/lib/imports/facebook/resolve';
import { firstFacebookUrlIn } from '@/lib/imports/facebook/url';
import {
  extractFromText,
  ingestPastedImageUrls,
  ingestRemoteImages,
} from '@/lib/imports/extract';
import { ImportPublishError, parsePayload, publishImport } from '@/lib/imports/publish';
import { grantManualImportConsent, requestImportConsent } from '@/lib/imports/consent';
import type { ParsedIntake } from '@/lib/intake/parser/types';

const BASE_PATH = '/back-office/imports';

/**
 * Staff gate for every action in this file.
 *
 * Throws rather than redirecting, matching moderation/actions.ts and
 * social/actions.ts — a server action has no page to send anyone to. The flag
 * is checked here too, not only on the page: hiding a screen is not access
 * control, and these actions create accounts and publish listings.
 */
async function requireStaff() {
  const user = await getUser();
  if (!user || (user.role !== 'admin' && user.role !== 'ops')) {
    throw new Error('Unauthorized');
  }

  const flags = await loadFeatureFlags();
  if (!flags.enableFacebookImport) {
    throw new Error('Facebook import is switched off.');
  }
  return user;
}

/**
 * Which of the numbers in an advert to offer as the owner's.
 *
 * A Sri Lankan rental ad routinely carries two: the landlord's mobile and an
 * office or agency landline. `phoneCandidates` is in written order, and the
 * landline is often written first — but the mobile is the one on WhatsApp, and
 * WhatsApp is the only channel the consent request travels on. An office
 * landline chosen here does not merely fail: it spends the ONE ask this owner
 * ever gets (`already_asked` refuses a second), on a number that cannot receive
 * it.
 *
 * The full list stays in written order for the chips, so the operator can pick
 * the other one in a click when this guess is wrong.
 */
function preferMobile(candidates: string[]): string | null {
  return candidates.find((c) => c.startsWith('+947')) ?? candidates[0] ?? null;
}

/**
 * Paste a post → a draft to review.
 *
 * TWO PATHS, and the pasted one is the fast one. If the operator brought the
 * post text, nothing is asked of Facebook at all: the draft is parsed from
 * their paste and the review screen arrives filled in. If they brought only a
 * URL we try Facebook, which is slow and usually refuses.
 *
 * That ordering is the whole point. Facebook removed the groups API in April
 * 2024 and gates third-party page reads behind App Review, so for most adverts
 * `resolvePost` spends several seconds to return nothing — and the operator
 * then pastes the text on the review screen and pays for a SECOND round trip to
 * re-read it. Accepting the paste here collapses the common import from two
 * waits into one instant save.
 *
 * Resolution failure is still NOT an error path: a draft with no text and an
 * explanatory note is the expected outcome of the fetching path and the review
 * screen is built around it. Only a URL we would refuse to fetch at all — or
 * none at all — sends the operator back with an error.
 */
export async function createImportAction(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const typedUrl = String(formData.get('sourceUrl') ?? '').trim();
  const pastedText = String(formData.get('rawText') ?? '').trim();

  /*
   * Sharing a post from the Facebook app does not put a bare URL on the
   * clipboard — it puts the post's opening line, a blank line and then the
   * link. On a phone that whole thing lands in whichever box was tapped first,
   * so the URL is lifted back out rather than made the operator's problem.
   * This cannot widen what we will fetch: firstFacebookUrlIn runs every
   * candidate through parseFacebookUrl, the same allowlist the typed box gets.
   */
  const url = typedUrl || firstFacebookUrlIn(pastedText) || '';
  if (!url) redirect(`${BASE_PATH}/new?error=no_url`);

  let resolved;
  if (pastedText) {
    try {
      resolved = resolveFromPastedText(url, pastedText);
    } catch {
      redirect(`${BASE_PATH}/new?error=bad_url`);
    }
  } else {
    try {
      resolved = await resolvePost(url);
    } catch (err) {
      if (err instanceof UnsupportedUrlError) redirect(`${BASE_PATH}/new?error=bad_url`);
      console.error('[imports] resolve failed', err);
      redirect(`${BASE_PATH}/new?error=resolve_failed`);
    }
  }

  const { parsed, phoneCandidates, ownerName: extractedName } = resolved.text
    ? await extractFromText(resolved.text)
    : { parsed: null, phoneCandidates: [] as string[], ownerName: null };

  // Copy the images into our own bucket now rather than at publish: Facebook's
  // CDN URLs are signed and expire, so a draft reviewed an hour later would
  // otherwise lose its photos.
  const photoUrls = resolved.imageUrls.length
    ? await ingestRemoteImages(resolved.imageUrls)
    : [];

  const [record] = await db
    .insert(postImports)
    .values({
      sourceUrl: resolved.canonicalUrl,
      sourcePlatform: resolved.platform,
      resolvedVia: resolved.resolvedVia,
      rawText: resolved.text || null,
      parsedPayload: parsed ? JSON.stringify(parsed) : null,
      photoUrls: photoUrls.length ? JSON.stringify(photoUrls) : null,
      ownerPhone: preferMobile(phoneCandidates),
      // Graph gives a real byline for our own Page; everywhere else it is null
      // and the best available answer is whatever the advert itself labelled.
      ownerName: resolved.authorName ?? extractedName,
      importedBy: user.id,
    })
    .returning();

  await logAudit({
    action: 'post_import_created',
    entityType: 'post_import',
    entityId: record.id,
    userId: user.id,
    // `pasted` and not just resolvedVia: the fast path and a Facebook login
    // wall both record 'manual', and only this tells the two apart afterwards.
    metadata: {
      sourceUrl: resolved.canonicalUrl,
      resolvedVia: resolved.resolvedVia,
      pasted: Boolean(pastedText),
    },
  });

  revalidatePath(BASE_PATH);
  redirect(`${BASE_PATH}/${record.id}`);
}

/**
 * Re-run extraction over text the operator pasted or corrected.
 *
 * Field edits made by hand are preserved unless the operator explicitly asks
 * for a re-extract — losing twenty seconds of typing to a stray click is worse
 * than a stale parse.
 */
export async function reExtractAction(formData: FormData): Promise<void> {
  await requireStaff();
  const id = Number(formData.get('importId'));
  const rawText = String(formData.get('rawText') ?? '').trim();
  if (!Number.isFinite(id) || id <= 0) redirect(BASE_PATH);

  if (!rawText) redirect(`${BASE_PATH}/${id}?error=no_text`);

  const { parsed, phoneCandidates, ownerName: extractedName } = await extractFromText(rawText);
  const existing = await db.query.postImports.findFirst({
    where: eq(postImports.id, id),
  });

  /*
   * FILL EMPTY FIELDS — never overwrite.
   *
   * This used to replace parsedPayload wholesale, which silently discarded
   * every correction the operator had made, while the button claimed the
   * opposite. That matters more now than it did: with Facebook serving only a
   * headline, pasting the text and re-reading is the MAIN path, not a repair.
   *
   * Keeping what is already set means a second re-read is safe, and an operator
   * who fixes a mis-parsed town does not lose it by pressing the button again.
   */
  const merged = fillEmpty(parsePayload(existing?.parsedPayload ?? null), parsed);

  await db
    .update(postImports)
    .set({
      rawText,
      parsedPayload: JSON.stringify(merged),
      // Same rule for the phone: a confirmed choice outranks a fresh regex hit.
      ownerPhone: existing?.ownerPhone ?? preferMobile(phoneCandidates),
      ownerName: existing?.ownerName ?? extractedName,
      updatedAt: new Date(),
    })
    .where(eq(postImports.id, id));

  revalidatePath(`${BASE_PATH}/${id}`);
  redirect(`${BASE_PATH}/${id}?extracted=1`);
}

/**
 * The pasted post text, for a save that may or may not carry it.
 *
 * `|| existing` and not `??`: an absent field and an emptied one both arrive as
 * '', and a save posted from a form without the mirror (or by a client that
 * dropped it) must never blank text the operator already stored. Emptying the
 * box deliberately is not a use case; losing a paste is the bug this exists to
 * prevent.
 */
function keepRawText(formData: FormData, existing: string | null): string | null {
  const posted = String(formData.get('rawText') ?? '').trim();
  return posted || existing;
}

/**
 * Add photos the operator pasted URLs for, then save everything else too.
 *
 * SAVES FIRST, for the reason publishImportAction gives: a button that quietly
 * discards the edits on screen is a trap, and this one redirects.
 *
 * Facebook hands over one cover photo and keeps the album behind the login
 * wall, so the rest arrive either as file uploads or as URLs copied out of the
 * post. The URLs are signed and short-lived, which is exactly why the bytes are
 * copied into our own bucket here and now rather than referenced.
 *
 * `ingestPastedImageUrls` refuses anything that is not on Facebook's photo CDN
 * — an operator-typed URL that the SERVER then fetches is textbook SSRF, and
 * being staff is not the same as being trusted with our network position.
 */
export async function addPhotoUrlsAction(formData: FormData): Promise<void> {
  await requireStaff();
  const id = Number(formData.get('importId'));
  if (!Number.isFinite(id) || id <= 0) redirect(BASE_PATH);

  const existing = await db.query.postImports.findFirst({
    where: eq(postImports.id, id),
  });
  if (!existing) redirect(BASE_PATH);

  const pasted = String(formData.get('imageUrls') ?? '')
    .split(/[\s,]+/)
    .map((v) => v.trim())
    .filter(Boolean);

  const { stored, refused } = pasted.length
    ? await ingestPastedImageUrls(pasted)
    : { stored: [] as string[], refused: 0 };

  const kept = formData
    .getAll('photoUrls')
    .map((v) => String(v))
    .filter(Boolean);

  await db
    .update(postImports)
    .set({
      rawText: keepRawText(formData, existing.rawText),
      parsedPayload: JSON.stringify(
        mergeParsedFromForm(parsePayload(existing.parsedPayload), formData)
      ),
      // Appended, never replacing: the uploader's photos and the pasted ones
      // are the same album arriving by two routes. Deduped because an operator
      // re-pasting the list after a partial refusal is the normal way to retry.
      photoUrls: JSON.stringify([...new Set([...kept, ...stored])]),
      ownerPhone: normalizePhone(String(formData.get('ownerPhone') ?? '')),
      ownerName: String(formData.get('ownerName') ?? '').trim() || null,
      shareOnSocial: formData.get('shareOnSocial') === 'on',
      updatedAt: new Date(),
    })
    .where(eq(postImports.id, id));

  revalidatePath(`${BASE_PATH}/${id}`);
  redirect(`${BASE_PATH}/${id}?added=${stored.length}&refused=${refused}`);
}

/** Save the reviewed fields. Validation that matters happens at publish. */
export async function updateDraftAction(formData: FormData): Promise<void> {
  await requireStaff();
  const id = Number(formData.get('importId'));
  if (!Number.isFinite(id) || id <= 0) redirect(BASE_PATH);

  const existing = await db.query.postImports.findFirst({
    where: eq(postImports.id, id),
  });
  if (!existing) redirect(BASE_PATH);

  const parsed = mergeParsedFromForm(parsePayload(existing.parsedPayload), formData);
  const photoUrls = formData
    .getAll('photoUrls')
    .map((v) => String(v))
    .filter(Boolean);

  await db
    .update(postImports)
    .set({
      rawText: keepRawText(formData, existing.rawText),
      parsedPayload: JSON.stringify(parsed),
      photoUrls: photoUrls.length ? JSON.stringify(photoUrls) : null,
      ownerPhone: normalizePhone(String(formData.get('ownerPhone') ?? '')),
      ownerName: String(formData.get('ownerName') ?? '').trim() || null,
      shareOnSocial: formData.get('shareOnSocial') === 'on',
      updatedAt: new Date(),
    })
    .where(eq(postImports.id, id));

  revalidatePath(`${BASE_PATH}/${id}`);
  redirect(`${BASE_PATH}/${id}?saved=1`);
}

/**
 * Save, then publish. One action rather than two, because a review screen where
 * Publish silently discards unsaved edits is a trap.
 */
export async function publishImportAction(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const id = Number(formData.get('importId'));
  if (!Number.isFinite(id) || id <= 0) redirect(BASE_PATH);

  const existing = await db.query.postImports.findFirst({
    where: eq(postImports.id, id),
  });
  if (!existing) redirect(BASE_PATH);

  const parsed = mergeParsedFromForm(parsePayload(existing.parsedPayload), formData);
  const photoUrls = formData
    .getAll('photoUrls')
    .map((v) => String(v))
    .filter(Boolean);
  const ownerPhone = normalizePhone(String(formData.get('ownerPhone') ?? ''));
  const ownerName = String(formData.get('ownerName') ?? '').trim() || null;

  const [saved] = await db
    .update(postImports)
    .set({
      rawText: keepRawText(formData, existing.rawText),
      parsedPayload: JSON.stringify(parsed),
      photoUrls: photoUrls.length ? JSON.stringify(photoUrls) : null,
      ownerPhone,
      ownerName,
      shareOnSocial: formData.get('shareOnSocial') === 'on',
      updatedAt: new Date(),
    })
    .where(eq(postImports.id, id))
    .returning();

  /*
   * THE OPERATOR NO LONGER PUBLISHES. Since 0060 this button ASKS the owner,
   * and their reply is what creates the listing (see lib/imports/consent.ts).
   *
   * The completeness check still runs first and still runs here, because the
   * consent message quotes the title back to the owner and links to a preview
   * of the rent and rooms — asking someone to approve a half-empty advert of
   * their own property is worse than not asking at all. `publishImport` will
   * re-validate on the way through; this is the copy that produces a usable
   * error on the review screen rather than a dead WhatsApp message.
   */
  if (!saved.ownerPhone) {
    redirect(`${BASE_PATH}/${id}?error=incomplete`);
  }
  if (!parsed.title || !parsed.city || parsed.bedrooms == null || parsed.rentPerMonth == null) {
    redirect(`${BASE_PATH}/${id}?error=incomplete`);
  }
  if (saved.consentRequestedAt) {
    // Asking twice is how a stranger's polite silence becomes harassment, and
    // it burns WABA quality on a recipient who has already declined by not
    // answering. NEEDS_INFO_MAX_ROUNDS draws the same line for intake.
    redirect(`${BASE_PATH}/${id}?error=already_asked`);
  }

  let consent;
  try {
    consent = await requestImportConsent(saved, user.id);
  } catch (err) {
    console.error('[imports] consent request failed', err);
    redirect(`${BASE_PATH}/${id}?error=consent_failed`);
  }

  revalidatePath(BASE_PATH);
  revalidatePath(`${BASE_PATH}/${id}`);
  redirect(`${BASE_PATH}/${id}?asked=${consent.outcome}`);
}

/**
 * Publish on an operator's OWN attestation that the owner already agreed —
 * by phone, or a WhatsApp chat outside the template flow — instead of
 * waiting on the approved consent template. Gated behind
 * `allowManualImportConsent`, checked here too: hiding the button on the
 * review screen is not access control.
 *
 * `assertImportConsent` inside `publishImport` does not change — it is still
 * the one gate, still only checking `consentGrantedAt`. This grants that
 * same column through a second, audited path (`grantManualImportConsent`)
 * and then calls the exact same `publishImport` the WhatsApp-yes webhook
 * path calls, so the two can never drift apart in what "published" means.
 */
export async function publishManualConsentAction(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const id = Number(formData.get('importId'));
  if (!Number.isFinite(id) || id <= 0) redirect(BASE_PATH);

  const flags = await loadFeatureFlags();
  if (!flags.allowManualImportConsent) {
    redirect(`${BASE_PATH}/${id}?error=manual_consent_off`);
  }
  // The checkbox on the form, not a rubber stamp: an operator must
  // affirmatively confirm they actually have permission before this can run.
  if (formData.get('manualConsentAttested') !== 'on') {
    redirect(`${BASE_PATH}/${id}?error=manual_consent_unattested`);
  }

  const existing = await db.query.postImports.findFirst({
    where: eq(postImports.id, id),
  });
  if (!existing) redirect(BASE_PATH);

  // SAVES FIRST, same reason publishImportAction gives: a button that
  // quietly discards the edits on screen is a trap.
  const parsed = mergeParsedFromForm(parsePayload(existing.parsedPayload), formData);
  const photoUrls = formData
    .getAll('photoUrls')
    .map((v) => String(v))
    .filter(Boolean);
  const ownerPhone = normalizePhone(String(formData.get('ownerPhone') ?? ''));
  const ownerName = String(formData.get('ownerName') ?? '').trim() || null;

  const [saved] = await db
    .update(postImports)
    .set({
      rawText: keepRawText(formData, existing.rawText),
      parsedPayload: JSON.stringify(parsed),
      photoUrls: photoUrls.length ? JSON.stringify(photoUrls) : null,
      ownerPhone,
      ownerName,
      shareOnSocial: formData.get('shareOnSocial') === 'on',
      updatedAt: new Date(),
    })
    .where(eq(postImports.id, id))
    .returning();

  if (!saved.ownerPhone) {
    redirect(`${BASE_PATH}/${id}?error=incomplete`);
  }
  if (!parsed.title || !parsed.city || parsed.bedrooms == null || parsed.rentPerMonth == null) {
    redirect(`${BASE_PATH}/${id}?error=incomplete`);
  }

  let record = await grantManualImportConsent(id, user.id);
  if (!record) {
    // Consent already existed — a retry after a publish failure below, or the
    // owner separately answered a real WhatsApp ask before this button was
    // clicked. Either way, re-read the current row and let publishImport's
    // own status/consent checks decide what happens next, rather than
    // treating "already granted" as a dead end this button can't recover
    // from.
    record = (await db.query.postImports.findFirst({ where: eq(postImports.id, id) })) ?? null;
  }
  if (!record) redirect(BASE_PATH);

  try {
    await publishImport(record, user.id);
  } catch (err) {
    if (err instanceof ImportPublishError && err.message.includes('already been published')) {
      redirect(`${BASE_PATH}/${id}?published=1`);
    }
    // The attestation stands even though publishing failed — same rule the
    // WhatsApp-yes webhook path follows: it was freely given and must not be
    // silently discarded. grantManualImportConsent is idempotent, so a second
    // click retries the publish without re-attesting.
    console.error('[imports] manual-consent publish failed', err);
    redirect(`${BASE_PATH}/${id}?error=publish_failed`);
  }

  revalidatePath(BASE_PATH);
  revalidatePath(`${BASE_PATH}/${id}`);
  redirect(`${BASE_PATH}/${id}?published=1`);
}

export async function discardImportAction(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const id = Number(formData.get('importId'));
  if (!Number.isFinite(id) || id <= 0) redirect(BASE_PATH);

  await db
    .update(postImports)
    .set({ status: 'discarded', updatedAt: new Date() })
    .where(and(eq(postImports.id, id), ne(postImports.status, 'published')));

  await logAudit({
    action: 'post_import_discarded',
    entityType: 'post_import',
    entityId: id,
    userId: user.id,
  });

  revalidatePath(BASE_PATH);
  redirect(`${BASE_PATH}?discarded=1`);
}

/**
 * Fields the fresh parse may fill: only those the stored payload leaves null.
 * `missingFields` and the diagnostic keys always take the fresh value — they
 * describe this parse, not the operator's edits.
 */
function fillEmpty(existing: ParsedIntake, fresh: ParsedIntake): ParsedIntake {
  const keep = <K extends keyof ParsedIntake>(key: K): ParsedIntake[K] =>
    existing[key] == null ? fresh[key] : existing[key];

  return {
    ...fresh,
    title: keep('title'),
    description: keep('description'),
    propertyType: keep('propertyType'),
    address: keep('address'),
    city: keep('city'),
    district: keep('district'),
    bedrooms: keep('bedrooms'),
    bathrooms: keep('bathrooms'),
    rentPerMonth: keep('rentPerMonth'),
    depositMonths: keep('depositMonths'),
  };
}

/** Form fields over the stored parse. Blank clears; absent leaves alone. */
function mergeParsedFromForm(base: ParsedIntake, formData: FormData): ParsedIntake {
  const text = (key: string): string | null => {
    if (!formData.has(key)) return base[key as keyof ParsedIntake] as string | null;
    const value = String(formData.get(key) ?? '').trim();
    return value || null;
  };
  const number = (key: string): number | null => {
    if (!formData.has(key)) return base[key as keyof ParsedIntake] as number | null;
    const value = String(formData.get(key) ?? '').trim();
    if (!value) return null;
    const parsed = Number(value.replace(/[,\s]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  };

  const propertyType = text('propertyType');

  return {
    ...base,
    /*
     * `listings.title` is varchar(200) and Postgres raises 22001 rather than
     * truncating, so a headline pasted straight out of a Facebook advert came
     * back as an unhandled server-action error with the operator's whole draft
     * still on screen and no explanation. The input carries maxLength=200 too;
     * this is the half that survives a paste that bypasses it.
     */
    title: text('title')?.slice(0, 200) ?? null,
    description: text('description'),
    propertyType:
      propertyType === 'house' || propertyType === 'apartment' || propertyType === 'room'
        ? propertyType
        : null,
    address: text('address'),
    city: text('city'),
    district: text('district'),
    bedrooms: number('bedrooms'),
    bathrooms: number('bathrooms'),
    rentPerMonth: number('rentPerMonth'),
    depositMonths: number('depositMonths'),
  };
}
