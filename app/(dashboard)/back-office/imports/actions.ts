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
import { resolvePost, UnsupportedUrlError } from '@/lib/imports/facebook/resolve';
import { extractFromText, ingestRemoteImages } from '@/lib/imports/extract';
import { publishImport, ImportPublishError, parsePayload } from '@/lib/imports/publish';
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
 * Paste a URL → a draft to review.
 *
 * Resolution failure is NOT an error path: Facebook refuses group posts
 * outright, so a draft with no text and an explanatory note is the expected
 * outcome and the review screen is built around it. Only a URL we would refuse
 * to fetch at all sends the operator back with an error.
 */
export async function createImportAction(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const url = String(formData.get('sourceUrl') ?? '').trim();

  let resolved;
  try {
    resolved = await resolvePost(url);
  } catch (err) {
    if (err instanceof UnsupportedUrlError) redirect(`${BASE_PATH}/new?error=bad_url`);
    console.error('[imports] resolve failed', err);
    redirect(`${BASE_PATH}/new?error=resolve_failed`);
  }

  const { parsed, phoneCandidates } = resolved.text
    ? await extractFromText(resolved.text)
    : { parsed: null, phoneCandidates: [] as string[] };

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
      ownerPhone: phoneCandidates[0] ?? null,
      ownerName: resolved.authorName,
      importedBy: user.id,
    })
    .returning();

  await logAudit({
    action: 'post_import_created',
    entityType: 'post_import',
    entityId: record.id,
    userId: user.id,
    metadata: { sourceUrl: resolved.canonicalUrl, resolvedVia: resolved.resolvedVia },
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

  const { parsed, phoneCandidates } = await extractFromText(rawText);
  const existing = await db.query.postImports.findFirst({
    where: eq(postImports.id, id),
  });

  await db
    .update(postImports)
    .set({
      rawText,
      parsedPayload: JSON.stringify(parsed),
      // Only fill a phone we do not already have — the operator's confirmed
      // choice outranks anything a regex finds on a re-read.
      ownerPhone: existing?.ownerPhone ?? phoneCandidates[0] ?? null,
      updatedAt: new Date(),
    })
    .where(eq(postImports.id, id));

  revalidatePath(`${BASE_PATH}/${id}`);
  redirect(`${BASE_PATH}/${id}?extracted=1`);
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
      parsedPayload: JSON.stringify(parsed),
      photoUrls: photoUrls.length ? JSON.stringify(photoUrls) : null,
      ownerPhone: normalizePhone(String(formData.get('ownerPhone') ?? '')),
      ownerName: String(formData.get('ownerName') ?? '').trim() || null,
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
      parsedPayload: JSON.stringify(parsed),
      photoUrls: photoUrls.length ? JSON.stringify(photoUrls) : null,
      ownerPhone,
      ownerName,
      updatedAt: new Date(),
    })
    .where(eq(postImports.id, id))
    .returning();

  let result;
  try {
    result = await publishImport(saved, user.id);
  } catch (err) {
    if (err instanceof ImportPublishError) {
      redirect(`${BASE_PATH}/${id}?error=incomplete`);
    }
    console.error('[imports] publish failed', err);
    redirect(`${BASE_PATH}/${id}?error=publish_failed`);
  }

  revalidatePath(BASE_PATH);
  revalidatePath(`${BASE_PATH}/${id}`);
  redirect(`${BASE_PATH}/${id}?published=${result.notify}`);
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
    title: text('title'),
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
  };
}
