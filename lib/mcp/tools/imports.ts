import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { postImports, type PostImport } from '@/lib/db/schema';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { normalizePhone } from '@/lib/auth/phone-verification';
import { ImportPublishError, parsePayload, parsePhotoUrls, publishImport } from '@/lib/imports/publish';
import { grantManualImportConsent, requestImportConsent } from '@/lib/imports/consent';
import { MAX_EXTRA_PHONES, cleanExtraPhones, parseExtraPhones, serializeExtraPhones, unreadablePhones } from '@/lib/imports/phones';
import type { ParsedIntake } from '@/lib/intake/parser/types';
import { ToolError, defineTool, type ToolContext } from '../types';
import { PROPERTY_TYPES, listingUrl } from './shared';

/**
 * Facebook-import tools for the connector (2026-11-28).
 *
 * The importer is OPT-IN (CLAUDE.md, "THE IMPORTER IS OPT-IN"), and nothing in
 * this file relaxes that. These tools call the SAME lib functions the
 * back-office server actions call — `requestImportConsent`,
 * `grantManualImportConsent`, `publishImport` — and `assertImportConsent`
 * inside `publishImport` stays the one gate. The server actions themselves
 * cannot be reused: they `redirect()`, which is a thrown control-flow signal,
 * not a result a tool can read.
 *
 * Two ways to publish, mirroring the review screen:
 *  - `admin_request_import_consent` sends the approved WhatsApp template; the
 *    owner's YES creates the listing. Nothing is public until then.
 *  - `admin_publish_import` is the manual-consent path: the operator confirms
 *    the owner already agreed (phone call, WhatsApp chat). It needs
 *    `allowManualImportConsent` ON and `ownerConsentConfirmed: true`, the
 *    connector's equivalent of the attestation checkbox.
 *
 * Social sharing defaults OFF on the publish tool: an operator using the
 * connector to put a listing on the website has not said anything about
 * Facebook, and posting a third party's property to our Page is not reversible
 * on Instagram or TikTok.
 */
const STAFF = ['ops', 'admin'] as const;
const IMPORT_STATUSES = ['draft', 'awaiting_consent', 'published', 'declined', 'discarded'] as const;
const importIdArg = z.number().int().min(1).describe('The import id (from admin_list_imports)');

async function requireImportsEnabled(): Promise<void> {
  const flags = await loadFeatureFlags();
  if (!flags.enableFacebookImport) {
    throw new ToolError('Facebook import is switched off (enableFacebookImport).');
  }
}

async function loadImport(id: number): Promise<PostImport> {
  const record = await db.query.postImports.findFirst({ where: eq(postImports.id, id) });
  if (!record) throw new ToolError(`Import ${id} not found.`);
  return record;
}

/** The same completeness rule the review screen applies before asking or publishing. */
export function missingForPublish(record: Pick<PostImport, 'ownerPhone'>, parsed: ParsedIntake): string[] {
  const missing: string[] = [];
  if (!parsed.title) missing.push('title');
  if (!parsed.city) missing.push('city');
  if (parsed.bedrooms == null) missing.push('bedrooms');
  if (parsed.rentPerMonth == null) missing.push('rentPerMonth');
  if (!record.ownerPhone) missing.push('ownerPhone');
  return missing;
}

function reviewUrl(origin: string, id: number): string {
  return `${origin}/back-office/imports/${id}`;
}

function summarize(record: PostImport, ctx: ToolContext) {
  const parsed = parsePayload(record.parsedPayload);
  return {
    id: record.id,
    status: record.status,
    sourceUrl: record.sourceUrl,
    sourcePlatform: record.sourcePlatform,
    title: parsed.title,
    city: parsed.city,
    bedrooms: parsed.bedrooms,
    rentPerMonthLKR: parsed.rentPerMonth,
    ownerName: record.ownerName,
    ownerPhone: record.ownerPhone,
    photoCount: parsePhotoUrls(record.photoUrls).length,
    hasPostText: Boolean(record.rawText),
    missingForPublish: missingForPublish(record, parsed),
    shareOnSocial: record.shareOnSocial,
    consent: {
      requestedAt: record.consentRequestedAt,
      outcome: record.consentOutcome,
      grantedAt: record.consentGrantedAt,
      source: record.consentSource,
      declinedAt: record.consentDeclinedAt,
    },
    listingId: record.listingId,
    listingUrl: record.listingId ? listingUrl(ctx.origin, record.listingId) : null,
    reviewUrl: reviewUrl(ctx.origin, record.id),
    createdAt: record.createdAt,
  };
}

export const adminListImports = defineTool({
  name: 'admin_list_imports',
  title: 'List Facebook imports',
  description:
    'Facebook posts imported by staff, newest first, with extracted title/city/rent/bedrooms, the owner phone, consent state and what is still missing before it can be published. ' +
    'An import is NOT a listing until it is published.',
  scope: 'admin',
  roles: [...STAFF],
  input: z.object({
    status: z.enum(IMPORT_STATUSES).optional().describe('Filter by status; omit for all'),
    limit: z.number().int().min(1).max(50).default(20),
    offset: z.number().int().min(0).default(0),
  }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  async handler({ status, limit, offset }, ctx) {
    await requireImportsEnabled();
    const rows = await db
      .select()
      .from(postImports)
      .where(status ? eq(postImports.status, status) : undefined)
      .orderBy(desc(postImports.createdAt))
      .limit(limit)
      .offset(offset);
    return { count: rows.length, imports: rows.map((r) => summarize(r, ctx)) };
  },
});

export const adminGetImport = defineTool({
  name: 'admin_get_import',
  title: 'Read a Facebook import',
  description: 'One import in full: the pasted/extracted post text, every parsed field, photo URLs and consent state.',
  scope: 'admin',
  roles: [...STAFF],
  input: z.object({ importId: importIdArg }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  async handler({ importId }, ctx) {
    await requireImportsEnabled();
    const record = await loadImport(importId);
    const parsed = parsePayload(record.parsedPayload);
    return {
      ...summarize(record, ctx),
      postText: record.rawText,
      parsed: {
        title: parsed.title,
        description: parsed.description,
        propertyType: parsed.propertyType,
        address: parsed.address,
        city: parsed.city,
        district: parsed.district,
        bedrooms: parsed.bedrooms,
        bathrooms: parsed.bathrooms,
        rentPerMonth: parsed.rentPerMonth,
        depositMonths: parsed.depositMonths,
        keyMoney: parsed.keyMoney ?? null,
      },
      photos: parsePhotoUrls(record.photoUrls),
      ownerPhoneIsWhatsApp: record.ownerPhoneIsWhatsApp,
      extraPhones: parseExtraPhones(record.extraPhones),
    };
  },
});

const EDITABLE = new Set<PostImport['status']>(['draft', 'awaiting_consent']);

export const adminUpdateImport = defineTool({
  name: 'admin_update_import',
  title: 'Edit a Facebook import',
  description:
    'Correct or fill in an import before it is published. Pass only the fields to change; an empty string clears a text field. ' +
    'Do NOT put phone numbers in the description — ownerPhone is the contact number.',
  scope: 'admin',
  roles: [...STAFF],
  input: z.object({
    importId: importIdArg,
    title: z.string().max(200).optional(),
    description: z.string().max(5000).optional(),
    propertyType: z.enum(PROPERTY_TYPES).optional(),
    address: z.string().max(300).optional(),
    city: z.string().max(100).optional().describe('Town or city (use search_locations for the exact spelling)'),
    district: z.string().max(100).optional(),
    bedrooms: z.number().int().min(1).max(20).optional(),
    bathrooms: z.number().int().min(0).max(20).optional(),
    rentPerMonth: z.number().int().min(1000).max(100_000_000).optional().describe('Monthly rent in LKR'),
    depositMonths: z.number().int().min(0).max(24).optional().describe('Deposit in months of rent; replaces key money'),
    keyMoney: z.number().int().min(1).max(1_000_000_000).optional().describe('Key money: a lump sum in LKR, INSTEAD of a deposit'),
    ownerPhoneIsWhatsApp: z.boolean().optional(),
    extraPhones: z
      .array(z.object({ phone: z.string().max(30), isWhatsApp: z.boolean().default(false) }))
      .max(MAX_EXTRA_PHONES)
      .optional()
      .describe('The advert\'s other numbers, shown on the listing. Replaces the current list; [] clears it'),
    ownerPhone: z.string().max(30).optional().describe('The owner\'s mobile, e.g. 0771234567'),
    ownerName: z.string().max(100).optional(),
    shareOnSocial: z.boolean().optional().describe('Also post to Easy Rent\'s Facebook/Instagram/TikTok once live'),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async handler({ importId, ownerPhone, ownerName, shareOnSocial, ownerPhoneIsWhatsApp, extraPhones, keyMoney, ...fields }, ctx) {
    await requireImportsEnabled();
    const record = await loadImport(importId);
    if (!EDITABLE.has(record.status)) {
      throw new ToolError(`Import ${importId} is ${record.status} and can no longer be edited.`);
    }

    const parsed = parsePayload(record.parsedPayload);
    const blank = (v: string | undefined) => (v === undefined ? undefined : v.trim() || null);
    const next: ParsedIntake = { ...parsed };
    for (const key of ['title', 'description', 'address', 'city', 'district'] as const) {
      const v = blank(fields[key]);
      if (v !== undefined) next[key] = v;
    }
    for (const key of ['propertyType', 'bedrooms', 'bathrooms', 'rentPerMonth', 'depositMonths'] as const) {
      if (fields[key] !== undefined) (next as any)[key] = fields[key];
    }

    // One replaces the other, and key money wins if both are passed.
    if (keyMoney !== undefined) {
      next.keyMoney = keyMoney;
      next.depositMonths = null;
    } else if (fields.depositMonths !== undefined) {
      next.keyMoney = null;
    }

    let phone = record.ownerPhone;
    if (ownerPhone !== undefined) {
      phone = ownerPhone.trim() ? normalizePhone(ownerPhone) : null;
      if (ownerPhone.trim() && !phone) throw new ToolError(`"${ownerPhone}" is not a phone number we can use.`);
    }

    const extras = cleanExtraPhones(
      extraPhones ?? parseExtraPhones(record.extraPhones),
      phone,
      normalizePhone
    );
    const unreadable = extraPhones ? unreadablePhones(extras) : [];
    if (unreadable.length) throw new ToolError(`"${unreadable[0]}" is not a phone number we can use.`);

    const [saved] = await db
      .update(postImports)
      .set({
        parsedPayload: JSON.stringify(next),
        ownerPhone: phone,
        extraPhones: serializeExtraPhones(extras),
        ...(ownerPhoneIsWhatsApp !== undefined ? { ownerPhoneIsWhatsApp } : {}),
        ...(ownerName !== undefined ? { ownerName: ownerName.trim() || null } : {}),
        ...(shareOnSocial !== undefined ? { shareOnSocial } : {}),
        updatedAt: new Date(),
      })
      .where(eq(postImports.id, importId))
      .returning();
    return summarize(saved, ctx);
  },
});

export const adminRequestImportConsent = defineTool({
  name: 'admin_request_import_consent',
  title: 'Ask an import\'s owner for consent',
  description:
    'Send the owner the approved WhatsApp consent template. Nothing becomes public now: the owner\'s YES creates the listing (and, because the template names them, allows sharing to Easy Rent\'s social accounts). ' +
    'Each owner can be asked only once. Only for imports with a Facebook source URL.',
  scope: 'admin',
  roles: [...STAFF],
  input: z.object({ importId: importIdArg }),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  async handler({ importId }, ctx) {
    await requireImportsEnabled();
    const record = await loadImport(importId);
    if (record.status !== 'draft') throw new ToolError(`Import ${importId} is ${record.status}, not a draft.`);
    const missing = missingForPublish(record, parsePayload(record.parsedPayload));
    if (missing.length) throw new ToolError(`Fill these in first with admin_update_import: ${missing.join(', ')}.`);
    if (!record.sourceUrl) {
      throw new ToolError('A pasted import has no Facebook post, so the consent template would be untrue. Use admin_publish_import once the owner has agreed.');
    }
    if (!record.ownerPhoneIsWhatsApp) throw new ToolError('The owner\'s number is not marked as WhatsApp, and the consent request is a WhatsApp message.');
    if (record.consentRequestedAt) throw new ToolError('This owner has already been asked once; they will not be asked again.');

    const { outcome, previewUrl } = await requestImportConsent(record, ctx.user.id);
    return {
      importId,
      outcome,
      previewUrl,
      note:
        outcome === 'sent'
          ? 'Sent. The listing is created when the owner replies YES.'
          : outcome === 'dry_run'
            ? 'Not sent: notifyImportedOwners is off or the consent template is not configured.'
            : 'WhatsApp rejected the message.',
    };
  },
});

export const adminPublishImport = defineTool({
  name: 'admin_publish_import',
  title: 'Publish an import (owner already agreed)',
  description:
    'Publish an import as a listing under the property owner, on the operator\'s confirmation that the owner ALREADY agreed (phone call or WhatsApp chat). ' +
    'Only call this when the user has explicitly said the owner gave permission — never to skip asking. Needs the allowManualImportConsent setting. ' +
    'Website only unless shareOnSocial is true.',
  scope: 'admin',
  roles: [...STAFF],
  input: z.object({
    importId: importIdArg,
    ownerConsentConfirmed: z
      .literal(true)
      .describe('Must be true: the operator confirms the property owner agreed to this listing being published'),
    shareOnSocial: z.boolean().default(false).describe('Also post to Easy Rent\'s Facebook/Instagram/TikTok. Default false: website only'),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  async handler({ importId, shareOnSocial }, ctx) {
    await requireImportsEnabled();
    const flags = await loadFeatureFlags();
    if (!flags.allowManualImportConsent) {
      throw new ToolError('Manual consent is switched off (allowManualImportConsent in Back Office → Settings).');
    }

    let record = await loadImport(importId);
    if (record.status === 'published') {
      throw new ToolError(`Import ${importId} is already published as listing ${record.listingId}.`);
    }
    if (record.status === 'declined' || record.status === 'discarded') {
      throw new ToolError(`Import ${importId} is ${record.status} and cannot be published.`);
    }
    const missing = missingForPublish(record, parsePayload(record.parsedPayload));
    if (missing.length) throw new ToolError(`Fill these in first with admin_update_import: ${missing.join(', ')}.`);

    if (record.shareOnSocial !== shareOnSocial) {
      [record] = await db
        .update(postImports)
        .set({ shareOnSocial, updatedAt: new Date() })
        .where(eq(postImports.id, importId))
        .returning();
    }

    // Idempotent: null means consent already existed (a retry, or the owner
    // answered the template meanwhile); publishImport re-checks either way.
    const granted = await grantManualImportConsent(importId, ctx.user.id);
    if (granted) record = granted;

    try {
      const result = await publishImport(record, ctx.user.id);
      return {
        importId,
        listingId: result.listingId,
        live: result.live,
        status: result.live ? 'active' : 'pending (automated checks)',
        sharedToSocial: shareOnSocial,
        ownerNotice: result.notify,
        listingUrl: listingUrl(ctx.origin, result.listingId),
      };
    } catch (err) {
      if (err instanceof ImportPublishError) throw new ToolError(err.message);
      throw err;
    }
  },
});

export const importTools = [
  adminListImports,
  adminGetImport,
  adminUpdateImport,
  adminRequestImportConsent,
  adminPublishImport,
];
