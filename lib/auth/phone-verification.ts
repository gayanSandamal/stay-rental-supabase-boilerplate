/**
 * Prove-you-hold-this-number verification for contact numbers added through the
 * WEBSITE — the 60-second form, the full listing form, account settings.
 *
 * Numbers arriving through the WhatsApp intake pipeline are already verified at
 * insert time (`lib/intake/process.ts`), because Meta proved possession before
 * the message reached us. Every other path had no route to `verified` at all:
 * the column defaulted false and nothing in the codebase ever set it.
 *
 * This reuses that same proof rather than building a second one. The landlord
 * taps a wa.me deep link that prefills a short code; their message arrives on
 * the existing intake webhook carrying a sender number Meta has verified.
 *
 * THE CODE IS NOT THE PROOF. It is a correlation token — it says *which*
 * pending challenge this message answers, nothing more. Possession is proven by
 * the sender number, and `expectedPhone` must match it. A code that leaks (a
 * screenshot, a forwarded message, a shared screen) therefore verifies nothing
 * for anyone but the holder of that exact number. Stored sha256-only, in line
 * with password_reset_tokens and landlord_access_tokens.
 *
 * Deliberately NOT written here: `users.wa_phone`. Meta has proven possession,
 * so it is tempting — but wa_phone is a login identity with a unique index over
 * live accounts, and writing it would let a web signup silently collide with
 * (or absorb) an existing WhatsApp landlord's account. Verifying a contact
 * number is not the same act as claiming an identity to sign in with.
 */

import crypto from 'node:crypto';
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { phoneVerifications, userContactNumbers } from '@/lib/db/schema';
import { logAudit } from '@/lib/db/audit-logger';
import { getOrCreateOpsIdentity } from '@/lib/intake/ops-identity';
import { getWhatsAppSupportNumber } from '@/lib/site-config';

/**
 * Long enough to survive switching devices to answer (desktop users have to
 * pick up their phone); short enough that an abandoned code dies the same hour.
 */
export const VERIFICATION_TTL_MS = 30 * 60 * 1000;
/** Wrong-sender attempts before the challenge is spent. */
export const MAX_VERIFICATION_ATTEMPTS = 5;

/**
 * Unambiguous alphabet: no O/0, I/1, L, or U. Landlords read these off one
 * screen and (when the deep link fails) retype them on another, so a character
 * pair that looks alike is a support ticket.
 */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 6;

/**
 * The token that carries the code through a chat message. Prefixed so detection
 * can be a strict, anchored match: no listing text ever contains this shape, so
 * checking for it before the intake session append cannot swallow a real
 * property submission.
 */
export const VERIFY_PREFIX = 'EZR-VERIFY';

/** Matches the code anywhere in a message — senders add "hi" and emoji around it. */
export const VERIFY_CODE_RE = new RegExp(
  `\\b${VERIFY_PREFIX}-([${CODE_ALPHABET}]{${CODE_LENGTH}})\\b`,
  'i'
);

export function generateCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    // randomInt over the alphabet length — modulo of a random byte would bias
    // toward the first 16 characters (256 % 30 !== 0).
    out += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

export function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
}

/** Pull the code out of an inbound message, uppercased. Null when absent. */
export function extractVerificationCode(text: string | null | undefined): string | null {
  const m = (text ?? '').match(VERIFY_CODE_RE);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Best-effort E.164 for a user-typed Sri Lankan number.
 *
 * Contact numbers are free text — landlords type "077 123 4567", "+94 77 123
 * 4567", "0094771234567". The webhook hands us bare digits ("94771234567").
 * Both sides go through here so the comparison is apples to apples.
 *
 * Returns null rather than guessing when the shape is not recognisable: a wrong
 * normalization would compare two different numbers and either verify the wrong
 * row or block a legitimate landlord forever.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  // 00 is the international access prefix ("0094771234567").
  if (digits.startsWith('00')) digits = digits.slice(2);

  // Local trunk form: 0771234567 → 94771234567.
  if (digits.length === 10 && digits.startsWith('0')) {
    return `+94${digits.slice(1)}`;
  }
  // Bare subscriber number: 771234567.
  if (digits.length === 9) {
    return `+94${digits}`;
  }
  // Already country-coded.
  if (digits.length === 11 && digits.startsWith('94')) {
    return `+${digits}`;
  }
  // Non-LK international. Only trusted when the author actually wrote a '+' —
  // without it we cannot tell a foreign number from a mistyped local one.
  if (raw.trim().startsWith('+') && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}

/** The wa.me deep link that prefills the challenge. Null when unconfigured. */
export function buildVerifyLink(code: string): string | null {
  const support = getWhatsAppSupportNumber();
  if (!support) return null;
  const text = `${VERIFY_PREFIX}-${code}`;
  return `https://wa.me/${support}?text=${encodeURIComponent(text)}`;
}

export type MintFailure = 'unnormalizable' | 'not_configured';

export interface MintedVerification {
  code: string;
  link: string;
  expiresAt: Date;
  expectedPhone: string;
}

/**
 * Create (or replace) the pending challenge for a contact number.
 *
 * Re-minting supersedes the previous code rather than adding a second live one:
 * the table holds one row per contact number, so the "resend" button a landlord
 * mashes cannot leave five valid codes behind.
 */
export async function mintPhoneVerification(args: {
  contactNumberId: number;
  userId: number;
  phoneNumber: string;
}): Promise<{ ok: true; value: MintedVerification } | { ok: false; reason: MintFailure }> {
  const expectedPhone = normalizePhone(args.phoneNumber);
  if (!expectedPhone) return { ok: false, reason: 'unnormalizable' };

  const code = generateCode();
  const link = buildVerifyLink(code);
  if (!link) return { ok: false, reason: 'not_configured' };

  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);

  await db
    .insert(phoneVerifications)
    .values({
      contactNumberId: args.contactNumberId,
      userId: args.userId,
      codeHash: hashCode(code),
      expectedPhone,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: phoneVerifications.contactNumberId,
      set: {
        codeHash: hashCode(code),
        expectedPhone,
        expiresAt,
        // A fresh challenge starts with a clean slate, otherwise a landlord who
        // burned the attempt budget on a typo could never try again.
        attempts: 0,
        consumedAt: null,
        userId: args.userId,
        createdAt: new Date(),
      },
    });

  return { ok: true, value: { code, link, expiresAt, expectedPhone } };
}

export type RedeemFailure =
  | 'not_found'
  | 'expired'
  | 'already_used'
  | 'too_many_attempts'
  /** Right code, wrong number: someone else sent it. Never verifies. */
  | 'wrong_sender';

export interface RedeemSuccess {
  contactNumberId: number;
  userId: number;
  phoneNumber: string;
}

/**
 * Redeem a code against the number that actually sent it.
 *
 * `senderE164` must come from the channel adapter (i.e. Meta's verified sender
 * id), never from message text — that is the entire security property.
 */
export async function redeemPhoneVerification(args: {
  code: string;
  senderE164: string;
}): Promise<{ ok: true; value: RedeemSuccess } | { ok: false; reason: RedeemFailure }> {
  const sender = normalizePhone(args.senderE164);
  const row = await db.query.phoneVerifications.findFirst({
    where: eq(phoneVerifications.codeHash, hashCode(args.code)),
  });

  if (!row) return { ok: false, reason: 'not_found' };
  if (row.consumedAt) return { ok: false, reason: 'already_used' };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'expired' };
  if (row.attempts >= MAX_VERIFICATION_ATTEMPTS) {
    return { ok: false, reason: 'too_many_attempts' };
  }

  if (!sender || sender !== row.expectedPhone) {
    // Someone holding the code messaged from a different number. Burn an
    // attempt and tell them nothing about what we expected — the reply copy
    // must not leak the target number to whoever is holding a stolen code.
    await db
      .update(phoneVerifications)
      .set({ attempts: sql`${phoneVerifications.attempts} + 1` })
      .where(eq(phoneVerifications.id, row.id));
    await logAudit({
      action: 'contact_verified',
      entityType: 'contact_number',
      entityId: row.contactNumberId,
      userId: row.userId,
      metadata: { outcome: 'wrong_sender', attempts: row.attempts + 1 },
    }).catch(() => {});
    return { ok: false, reason: 'wrong_sender' };
  }

  // Possession proven. "Platform support verified this" is still the honest
  // actor here — the platform did, automatically — so verifiedBy carries the
  // same ops identity the WhatsApp intake path uses.
  const ops = await getOrCreateOpsIdentity();
  const now = new Date();

  const [updated] = await db
    .update(userContactNumbers)
    .set({
      verified: true,
      verifiedAt: now,
      verifiedBy: ops.userId,
      // They just messaged us from it, so WhatsApp reachability is now a fact
      // rather than the landlord's own claim.
      isWhatsApp: true,
      updatedAt: now,
    })
    .where(eq(userContactNumbers.id, row.contactNumberId))
    .returning();

  await db
    .update(phoneVerifications)
    .set({ consumedAt: now })
    .where(eq(phoneVerifications.id, row.id));

  await logAudit({
    action: 'contact_verified',
    entityType: 'contact_number',
    entityId: row.contactNumberId,
    userId: row.userId,
    metadata: { outcome: 'verified', channel: row.channel, phone: row.expectedPhone },
  }).catch(() => {});

  return {
    ok: true,
    value: {
      contactNumberId: row.contactNumberId,
      userId: row.userId,
      phoneNumber: updated?.phoneNumber ?? row.expectedPhone,
    },
  };
}

/** Housekeeping for the cron: drop challenges long past useful life. */
export async function purgeDeadVerifications(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(phoneVerifications)
    .where(or(lt(phoneVerifications.expiresAt, cutoff), lt(phoneVerifications.consumedAt, cutoff)))
    .returning({ id: phoneVerifications.id });
  return deleted.length;
}

/** Is there a live, unconsumed challenge for this number? Drives the UI state. */
export async function hasPendingVerification(contactNumberId: number): Promise<boolean> {
  const row = await db.query.phoneVerifications.findFirst({
    where: and(
      eq(phoneVerifications.contactNumberId, contactNumberId),
      isNull(phoneVerifications.consumedAt)
    ),
  });
  return Boolean(row && row.expiresAt.getTime() > Date.now());
}
