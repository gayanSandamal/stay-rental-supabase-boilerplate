/**
 * Passwordless access links sent over WhatsApp.
 *
 * These are REUSABLE by design: the message stays in the landlord's chat and
 * they reopen it weeks later. A Supabase magic link cannot serve this directly —
 * its token is single-use (verified: reuse returns 403), so we hold our own
 * long-lived token and mint a fresh Supabase one at redeem time.
 *
 * Only the sha256 hash is stored, so an issued URL can never be reprinted;
 * "rotation" means minting a new row. The link is a bearer credential sitting in
 * a chat thread — see the security notes in the redeem route.
 */

import crypto from 'node:crypto';
import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { landlordAccessTokens, users } from '@/lib/db/schema';
import { logAudit } from '@/lib/db/audit-logger';

/** Long enough to sit in a chat for a season; short enough to eventually die. */
export const ACCESS_TOKEN_TTL_DAYS = Number(process.env.WA_LINK_TTL_DAYS ?? 90);
/** Cap live tokens per landlord to bound the bearer surface. */
const MAX_LIVE_TOKENS_PER_USER = 10;

export interface AccessLinks {
  token: string;
  viewUrl: string;
  editUrl: string;
  deleteUrl: string;
  /** Where the landlord takes the listing back off our social accounts. */
  socialUrl: string;
  dashboardUrl: string;
}

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL || 'https://easyrent.lk';
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Mint a link for this landlord. Scoped to the USER, not the listing: the
 * redeemed session is account-wide regardless, so a per-listing token would add
 * rows and URL length without adding security. The destination lives in the path.
 */
export async function mintAccessLink(args: {
  userId: number;
  listingId?: number | null;
  channel?: string;
}): Promise<AccessLinks> {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(landlordAccessTokens).values({
    userId: args.userId,
    tokenHash: hashToken(token),
    listingId: args.listingId ?? null,
    channel: args.channel ?? 'whatsapp',
    expiresAt,
  });

  await pruneTokens(args.userId);
  await logAudit({
    action: 'auth_link_issued',
    entityType: 'user',
    entityId: args.userId,
    userId: args.userId,
    metadata: { listingId: args.listingId ?? null, channel: args.channel ?? 'whatsapp' },
  }).catch(() => {});

  const root = baseUrl();
  const id = args.listingId;
  return {
    token,
    viewUrl: id ? `${root}/listings/${id}` : `${root}/listings`,
    editUrl: id ? `${root}/l/${token}/e/${id}` : `${root}/l/${token}`,
    deleteUrl: id ? `${root}/l/${token}/d/${id}` : `${root}/l/${token}`,
    socialUrl: id ? `${root}/l/${token}/s/${id}` : `${root}/l/${token}`,
    dashboardUrl: `${root}/l/${token}`,
  };
}

/** Keep only the newest N live tokens; older ones are revoked, not deleted. */
async function pruneTokens(userId: number): Promise<void> {
  try {
    const live = await db.query.landlordAccessTokens.findMany({
      where: and(eq(landlordAccessTokens.userId, userId), isNull(landlordAccessTokens.revokedAt)),
      orderBy: [desc(landlordAccessTokens.createdAt)],
    });
    const stale = live.slice(MAX_LIVE_TOKENS_PER_USER);
    for (const row of stale) {
      await db
        .update(landlordAccessTokens)
        .set({ revokedAt: new Date() })
        .where(eq(landlordAccessTokens.id, row.id));
    }
  } catch (err) {
    console.error('[access-links] prune failed', err);
  }
}

export type ResolveFailure = 'not_found' | 'revoked' | 'expired' | 'user_gone';

export interface ResolvedToken {
  tokenId: number;
  userId: number;
  email: string;
  authUserId: string | null;
  listingId: number | null;
}

export async function resolveAccessToken(
  token: string
): Promise<{ ok: true; value: ResolvedToken } | { ok: false; reason: ResolveFailure }> {
  const row = await db.query.landlordAccessTokens.findFirst({
    where: eq(landlordAccessTokens.tokenHash, hashToken(token)),
  });
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.revokedAt) return { ok: false, reason: 'revoked' };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'expired' };

  const user = await db.query.users.findFirst({
    where: and(eq(users.id, row.userId), isNull(users.deletedAt)),
  });
  if (!user) return { ok: false, reason: 'user_gone' };

  return {
    ok: true,
    value: {
      tokenId: row.id,
      userId: user.id,
      email: user.email,
      authUserId: user.authUserId,
      listingId: row.listingId,
    },
  };
}

/** Sliding expiry: an active landlord never gets locked out; abandoned links die. */
export async function touchAccessToken(tokenId: number): Promise<void> {
  try {
    await db
      .update(landlordAccessTokens)
      .set({
        lastUsedAt: new Date(),
        // Atomic increment: two devices opening the link at once must not lose a count.
        useCount: sql`${landlordAccessTokens.useCount} + 1`,
        expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
      })
      .where(eq(landlordAccessTokens.id, tokenId));
  } catch (err) {
    console.error('[access-links] touch failed', err);
  }
}

export async function revokeAccessTokensForUser(userId: number): Promise<void> {
  await db
    .update(landlordAccessTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(landlordAccessTokens.userId, userId), isNull(landlordAccessTokens.revokedAt)));
}

/** Housekeeping for the cron: drop rows long past useful life. */
export async function purgeDeadTokens(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(landlordAccessTokens)
    .where(or(lt(landlordAccessTokens.expiresAt, cutoff), lt(landlordAccessTokens.revokedAt, cutoff)))
    .returning({ id: landlordAccessTokens.id });
  return deleted.length;
}
