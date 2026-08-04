/**
 * Real landlord accounts for WhatsApp senders.
 *
 * IDENTITY MODEL: the verified WhatsApp number is the identity, stored in
 * `users.wa_phone`. Supabase Auth still needs an email (and `users.email` is
 * NOT NULL UNIQUE), so the auth record carries a deterministic synthetic
 * address on a subdomain with no MX record. Sign-in happens only through the
 * WhatsApp access link; there is no password.
 *
 * Why not `users.phone`: that column is user-typed and unverified. Matching on
 * it would let anyone claim another person's listings by typing their number.
 * `wa_phone` is written only here, after Meta has proven possession — the same
 * reasoning that already marks the intake contact number `verified: true`.
 *
 * Why not Supabase phone auth: the Phone provider needs an SMS provider, none
 * is configured, and a phone-only auth user has a NULL email which the
 * migration-0020 trigger cannot insert. If SMS is ever added,
 * `admin.updateUserById(id, { phone, phone_confirm: true })` attaches the phone
 * as a second identity on the same auth user and nothing here changes.
 */

import crypto from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { landlords, users } from '@/lib/db/schema';
import { getSupabaseAdmin } from '@/lib/supabase';
import { logAudit } from '@/lib/db/audit-logger';
import { createNotificationsForOpsAndAdmin } from '@/lib/notifications';

/** No MX record on this subdomain: a stray send dies in DNS, never delivered. */
export const WA_EMAIL_DOMAIN = 'wa.easyrent.lk';

export interface WhatsAppLandlord {
  userId: number;
  landlordId: number;
  authUserId: string | null;
  isNew: boolean;
}

/** Deterministic so a retry after a partial failure recovers the same account. */
export function syntheticEmailFor(e164: string): string {
  const digest = crypto.createHash('sha256').update(e164).digest('hex').slice(0, 16);
  return `wa-${digest}@${WA_EMAIL_DOMAIN}`;
}

/** Is this one of our placeholder addresses? Never render these publicly. */
export function isReservedWaEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.toLowerCase().endsWith(`@${WA_EMAIL_DOMAIN}`));
}

/**
 * Get-or-create the landlord account for a messaging sender.
 *
 * Returns null when an account cannot be established — callers must fall back
 * to the ops identity so the listing still publishes. A landlord's submission
 * must never be lost to an auth hiccup.
 */
export async function getOrCreateWhatsAppLandlord(args: {
  senderId: string;
  profileName: string | null;
}): Promise<WhatsAppLandlord | null> {
  const e164 = args.senderId.startsWith('+') ? args.senderId : `+${args.senderId}`;
  const email = syntheticEmailFor(e164);
  const displayName = args.profileName?.trim() || 'Property owner';

  try {
    // 1. Already known? The common path for a repeat sender.
    const existing = await db.query.users.findFirst({
      where: and(eq(users.waPhone, e164), isNull(users.deletedAt)),
    });
    if (existing) {
      const landlordId = await ensureLandlordRow(existing.id);
      return { userId: existing.id, landlordId, authUserId: existing.authUserId, isNew: false };
    }

    // 2. Create the auth user. No password → passwordless by construction.
    const admin = getSupabaseAdmin();
    let authUserId: string | null = null;
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        source: 'whatsapp_intake',
        wa_phone: e164,
        wa_profile_name: args.profileName ?? null,
      },
    });

    if (created.error) {
      // Already registered → a previous attempt died after creating the auth
      // user. Recover its id rather than orphaning a second one. Deliberately
      // NOT listUsers(), which scans every user in the project.
      if (/already|registered|exists/i.test(created.error.message)) {
        const byEmail = await db.query.users.findFirst({ where: eq(users.email, email) });
        if (byEmail?.authUserId) {
          authUserId = byEmail.authUserId;
        } else {
          const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
          authUserId = link.data?.user?.id ?? null;
        }
      }
      if (!authUserId) {
        console.error('[landlord-identity] createUser failed', created.error.message);
        return null;
      }
    } else {
      authUserId = created.data.user?.id ?? null;
    }
    if (!authUserId) return null;

    // 3. Reconcile public.users + landlords under a per-phone advisory lock, so
    //    two concurrent webhook deliveries can't both create an account.
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('wa_identity'), hashtext(${e164}))`);

      // The 0020 trigger inserts the row as role=tenant; upgrade and stamp it.
      const updated = await tx
        .update(users)
        .set({
          role: 'landlord',
          waPhone: e164,
          name: sql`coalesce(${users.name}, ${displayName})`,
          phone: sql`coalesce(${users.phone}, ${e164})`,
          updatedAt: new Date(),
        })
        .where(eq(users.authUserId, authUserId!))
        .returning({ id: users.id });

      if (updated.length) return { userId: updated[0].id, isNew: true };

      // No trigger (plain Postgres, or auth schema absent): insert ourselves.
      const inserted = await tx
        .insert(users)
        .values({
          authUserId: authUserId!,
          email,
          name: displayName,
          role: 'landlord',
          waPhone: e164,
          phone: e164,
        })
        .onConflictDoNothing({ target: users.authUserId })
        .returning({ id: users.id });
      if (inserted.length) return { userId: inserted[0].id, isNew: true };

      // Conflict: someone owns this row already.
      const winner = await tx.query.users.findFirst({ where: eq(users.authUserId, authUserId!) });
      if (winner) return { userId: winner.id, isNew: false };

      // Email is taken by a row that is NOT this auth user. Do not attach —
      // that would hand a stranger's account to whoever holds this number.
      return null;
    });

    if (!result) {
      await createNotificationsForOpsAndAdmin({
        type: 'whatsapp_intake',
        title: `Could not link WhatsApp sender ${e164} to an account — check for a duplicate`,
        link: '/back-office/whatsapp-intakes',
      }).catch(() => {});
      return null;
    }

    const landlordId = await ensureLandlordRow(result.userId);

    if (result.isNew) {
      // Best-effort trail; never fail account creation over a log write.
      await logAudit({
        action: 'wa_account_created',
        entityType: 'user',
        entityId: result.userId,
        userId: result.userId,
        metadata: { waPhone: e164, profileName: args.profileName },
      }).catch(() => {});
      await createNotificationsForOpsAndAdmin({
        type: 'whatsapp_intake',
        title: `New landlord account from WhatsApp: ${displayName} (${e164})`,
        link: '/back-office/whatsapp-intakes',
      }).catch(() => {});
    }

    // A pre-existing human account with this number typed into users.phone is
    // NOT merged — flag it for a human instead of guessing.
    await warnOnUnverifiedPhoneClash(e164, result.userId);

    return { userId: result.userId, landlordId, authUserId, isNew: result.isNew };
  } catch (err) {
    console.error('[landlord-identity] failed', err);
    return null;
  }
}

/** `listings.landlordId` is NOT NULL, so this must exist before publishing. */
async function ensureLandlordRow(userId: number): Promise<number> {
  const existing = await db.query.landlords.findFirst({ where: eq(landlords.userId, userId) });
  if (existing) return existing.id;
  const inserted = await db
    .insert(landlords)
    .values({ userId })
    .onConflictDoNothing({ target: landlords.userId })
    .returning({ id: landlords.id });
  if (inserted.length) return inserted[0].id;
  const winner = await db.query.landlords.findFirst({ where: eq(landlords.userId, userId) });
  return winner!.id;
}

async function warnOnUnverifiedPhoneClash(e164: string, ourUserId: number): Promise<void> {
  try {
    const clash = await db.query.users.findFirst({
      where: and(eq(users.phone, e164), isNull(users.deletedAt)),
    });
    if (clash && clash.id !== ourUserId) {
      await createNotificationsForOpsAndAdmin({
        type: 'whatsapp_intake',
        title: `Possible duplicate account: WhatsApp ${e164} also matches user #${clash.id}`,
        body: 'The WhatsApp account was kept separate. Merge manually if they are the same person.',
        link: '/back-office/team',
      });
    }
  } catch {
    // Advisory only.
  }
}
