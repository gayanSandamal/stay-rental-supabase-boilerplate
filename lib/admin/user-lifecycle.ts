import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  auditLogs,
  businessAccounts,
  featureFlags,
  imageModerationCache,
  impersonationSessions,
  landlords,
  listingSocialPosts,
  listings,
  savedSearches,
  socialAccounts,
  userContactNumbers,
  users,
} from '@/lib/db/schema';
import { logAudit } from '@/lib/db/audit-logger';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Banning and hard-deleting accounts.
 *
 * ONE MODULE, because the CLI script and the back-office button must not drift.
 * `scripts/hard-delete-user.ts` had grown its own copy of the erasure and had
 * fallen five foreign keys behind the schema — it would have thrown a
 * constraint violation on any ops or admin who had ever toggled a feature flag
 * or pulled down a social post. That is the failure mode a second copy
 * guarantees eventually.
 *
 * Every query here is sequential. The pool is `max: 1` in production against
 * Supabase's transaction pooler, where pipelining wedges the request
 * (CLAUDE.md, commit a3ac4f9).
 */

export class UserLifecycleError extends Error {}

/** Roles that may never be banned or deleted through the UI. */
function assertTargetable(
  target: { id: number; role: string },
  actorId: number,
  escapes: { allowSelf?: boolean; allowAdmin?: boolean } = {}
) {
  if (!escapes.allowSelf && target.id === actorId) {
    throw new UserLifecycleError('You cannot do this to your own account.');
  }
  if (!escapes.allowAdmin && target.role === 'admin') {
    /*
     * Never an admin from the UI. Not "not the last admin" — any admin. An admin
     * who can remove other admins can take the platform over alone. The escape
     * hatch is the CLI, which needs DATABASE_URL and a shell: a deliberately
     * higher bar than a button, and the documented recovery path.
     */
    throw new UserLifecycleError('Admin accounts cannot be banned or deleted here.');
  }
}

async function loadTarget(userId: number) {
  const [target] = await db
    .select({
      id: users.id,
      role: users.role,
      email: users.email,
      authUserId: users.authUserId,
      bannedAt: users.bannedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) throw new UserLifecycleError('No such user.');
  return target;
}

/**
 * Ban an account and take its listings off the market.
 *
 * Archiving is not incidental — it is the point. A banned landlord whose
 * listings stay live means renters keep calling a number nobody is answering
 * for, which is worse for the marketplace than the behaviour that earned the
 * ban. Archive, rather than delete, so the listings survive an unban.
 */
export async function banUser(args: {
  actorId: number;
  userId: number;
  reason: string;
}): Promise<{ archivedListings: number }> {
  const target = await loadTarget(args.userId);
  assertTargetable(target, args.actorId);
  if (target.role === 'ops') {
    // Removing an operator is a role change, not a ban.
    throw new UserLifecycleError('Ops accounts cannot be banned. Change their role instead.');
  }

  const reason = args.reason.trim().slice(0, 500);
  if (!reason) throw new UserLifecycleError('A reason is required.');

  const [landlord] = await db
    .select({ id: landlords.id })
    .from(landlords)
    .where(eq(landlords.userId, target.id))
    .limit(1);

  let archived = 0;
  if (landlord) {
    const live = await db
      .select({ id: listings.id })
      .from(listings)
      .where(
        and(
          eq(listings.landlordId, landlord.id),
          inArray(listings.status, ['active', 'pending'])
        )
      );

    /*
     * Pull down anything published to our own social accounts BEFORE archiving.
     * A listing leaving `active` must not stay live on Facebook or Instagram
     * (CLAUDE.md) — and for a banned landlord that is the whole point, since the
     * post is the part the public can still see.
     *
     * Sequential, and failure-tolerant: a Graph outage must not prevent the ban.
     */
    if (live.length > 0) {
      const { pullDownForListing } = await import('@/lib/social/publish');
      for (const l of live) {
        await pullDownForListing(l.id, 'Landlord account banned').catch(() => {});
      }
    }

    const rows = await db
      .update(listings)
      .set({ status: 'archived', archivedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(listings.landlordId, landlord.id),
          inArray(listings.status, ['active', 'pending'])
        )
      )
      .returning({ id: listings.id });
    archived = rows.length;
  }

  await db
    .update(users)
    .set({
      bannedAt: new Date(),
      bannedReason: reason,
      bannedBy: args.actorId,
      updatedAt: new Date(),
    })
    .where(eq(users.id, target.id));

  /*
   * Ban at the auth layer too. `banned_at` above stops every server render
   * immediately; this stops Supabase issuing new tokens. Neither alone is
   * enough — the local flag cannot revoke a token Supabase already signed, and
   * Supabase's ban leaves a live session working until it expires.
   */
  if (target.authUserId) {
    try {
      const supabase = getSupabaseAdmin();
      await supabase.auth.admin.updateUserById(target.authUserId, {
        ban_duration: '876000h', // ~100 years; Supabase has no "forever".
      });
    } catch (err) {
      // The local flag is authoritative for the app, so a failure here degrades
      // rather than breaks — but it must be visible.
      console.error('[banUser] Supabase auth ban failed:', err);
    }
  }

  await logAudit({
    action: 'user_banned',
    entityType: 'user',
    entityId: target.id,
    userId: args.actorId,
    metadata: { reason, archivedListings: archived, role: target.role },
  }).catch(() => {});

  return { archivedListings: archived };
}

/** Lift a ban. Listings stay archived — republishing is the landlord's choice. */
export async function unbanUser(args: { actorId: number; userId: number }): Promise<void> {
  const target = await loadTarget(args.userId);
  if (!target.bannedAt) return;

  await db
    .update(users)
    .set({ bannedAt: null, bannedReason: null, bannedBy: null, updatedAt: new Date() })
    .where(eq(users.id, target.id));

  if (target.authUserId) {
    try {
      const supabase = getSupabaseAdmin();
      await supabase.auth.admin.updateUserById(target.authUserId, { ban_duration: 'none' });
    } catch (err) {
      console.error('[unbanUser] Supabase auth unban failed:', err);
    }
  }

  await logAudit({
    action: 'user_unbanned',
    entityType: 'user',
    entityId: target.id,
    userId: args.actorId,
  }).catch(() => {});
}

/**
 * Erase an account and everything personal attached to it. IRREVERSIBLE.
 *
 * THE ORDER BELOW IS NOT ARBITRARY. Six tables reference `users` with ON DELETE
 * NO ACTION beyond the ones the old script knew about, so the final DELETE
 * fails with a constraint violation unless every one of them is cleared first.
 * The list was taken from information_schema, not from memory, because the
 * previous version was assembled from memory and was five keys out of date.
 *
 * WHAT IS DELIBERATELY NOT ERASED: the audit_logs rows are anonymised
 * (user_id -> NULL), not removed, and one new row records that this deletion
 * happened. Deleting the trail entirely would mean you could never prove an
 * erasure request was honoured, and an admin quietly removing accounts would
 * leave nothing behind. The surviving rows carry no personal data — only an id
 * that now refers to nobody.
 */
export async function hardDeleteUser(args: {
  actorId: number;
  userId: number;
  /**
   * The email the caller believes it is erasing, checked against the row.
   *
   * An id alone is not a strong enough statement of intent for something
   * irreversible: an operator acting from a list rendered minutes ago would
   * otherwise erase whoever now occupies that id. Typing the address is also the
   * speed bump that separates this from every other button on the page.
   */
  confirmEmail: string;
  /** CLI-only escapes; the API never sets these. See scripts/hard-delete-user.ts. */
  allowSelf?: boolean;
  allowAdmin?: boolean;
}): Promise<{ deletedListings: number; deletedPhotos: number }> {
  const target = await loadTarget(args.userId);
  assertTargetable(target, args.actorId, {
    allowSelf: args.allowSelf,
    allowAdmin: args.allowAdmin,
  });

  if (args.confirmEmail.trim().toLowerCase() !== target.email.toLowerCase()) {
    throw new UserLifecycleError(
      'The typed email does not match this account. Nothing was deleted.'
    );
  }

  const [landlord] = await db
    .select({ id: landlords.id })
    .from(landlords)
    .where(eq(landlords.userId, target.id))
    .limit(1);

  let deletedListings = 0;
  let deletedPhotos = 0;

  if (landlord) {
    const owned = await db
      .select({ id: listings.id, photos: listings.photos })
      .from(listings)
      .where(eq(listings.landlordId, landlord.id));

    /*
     * Take anything live off our social accounts first. Deleting the listing row
     * destroys `listing_social_posts` by cascade — and that row is the ONLY
     * handle we have for removing the post. Delete first and the post stays up
     * forever with nothing left to take it down with, which is the opposite of
     * "without a trace".
     */
    if (owned.length > 0) {
      const { pullDownForListing } = await import('@/lib/social/publish');
      for (const l of owned) {
        await pullDownForListing(l.id, 'Account deleted').catch(() => {});
      }
    }

    // Photos live in Supabase Storage, not in the database — a row delete would
    // leave every image publicly reachable at its original URL.
    deletedPhotos = await deleteStoredPhotos(owned);

    // Ops columns on OTHER people's listings that point at this user.
    await db
      .update(listings)
      .set({ verifiedBy: null, visitedBy: null, rejectedBy: null, createdBy: null })
      .where(
        or(
          eq(listings.verifiedBy, target.id),
          eq(listings.visitedBy, target.id),
          eq(listings.rejectedBy, target.id),
          eq(listings.createdBy, target.id)
        )
      );

    const removed = await db
      .delete(listings)
      .where(eq(listings.landlordId, landlord.id))
      .returning({ id: listings.id });
    deletedListings = removed.length;

    await db.delete(landlords).where(eq(landlords.id, landlord.id));
  } else {
    await db
      .update(listings)
      .set({ verifiedBy: null, visitedBy: null, rejectedBy: null, createdBy: null })
      .where(
        or(
          eq(listings.verifiedBy, target.id),
          eq(listings.visitedBy, target.id),
          eq(listings.rejectedBy, target.id),
          eq(listings.createdBy, target.id)
        )
      );
  }

  await db.delete(savedSearches).where(eq(savedSearches.userId, target.id));

  /*
   * Impersonation sessions are deleted, not anonymised: both columns are NOT
   * NULL, so there is nothing to null out. The audit_logs entries for
   * impersonation_started / impersonation_ended survive and still name the
   * acting admin, so the fact that it happened is not lost.
   */
  await db
    .delete(impersonationSessions)
    .where(
      or(
        eq(impersonationSessions.actorUserId, target.id),
        eq(impersonationSessions.subjectUserId, target.id)
      )
    );

  // Every remaining NO ACTION reference, from information_schema.
  await db
    .update(businessAccounts)
    .set({ createdBy: null })
    .where(eq(businessAccounts.createdBy, target.id));
  await db
    .update(landlords)
    .set({ kycVerifiedBy: null })
    .where(eq(landlords.kycVerifiedBy, target.id));
  await db
    .update(userContactNumbers)
    .set({ verifiedBy: null })
    .where(eq(userContactNumbers.verifiedBy, target.id));
  await db
    .update(featureFlags)
    .set({ updatedBy: null })
    .where(eq(featureFlags.updatedBy, target.id));
  await db
    .update(socialAccounts)
    .set({ connectedBy: null })
    .where(eq(socialAccounts.connectedBy, target.id));
  await db
    .update(imageModerationCache)
    .set({ overriddenBy: null })
    .where(eq(imageModerationCache.overriddenBy, target.id));
  await db
    .update(listingSocialPosts)
    .set({ pulledBy: null })
    .where(eq(listingSocialPosts.pulledBy, target.id));
  await db
    .update(listingSocialPosts)
    .set({ manualTakedownBy: null })
    .where(eq(listingSocialPosts.manualTakedownBy, target.id));
  await db
    .update(users)
    .set({ bannedBy: null })
    .where(eq(users.bannedBy, target.id));

  // Anonymise rather than delete — see the note above.
  await db.update(auditLogs).set({ userId: null }).where(eq(auditLogs.userId, target.id));

  // Cascades: business_account_members, landlord_access_tokens, notifications,
  // password_reset_tokens, phone_verifications, user_contact_numbers.
  await db.delete(users).where(eq(users.id, target.id));

  // Supabase Auth last: if it fails, the app row is already gone and the orphan
  // is inert, whereas the reverse leaves a signed-in user with no profile.
  if (target.authUserId) {
    try {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase.auth.admin.deleteUser(target.authUserId);
      if (error) console.error('[hardDeleteUser] auth delete failed:', error.message);
    } catch (err) {
      console.error('[hardDeleteUser] auth delete threw:', err);
    }
  }

  /*
   * NULL when the actor IS the target — which is how the CLI runs, since there
   * is no signed-in operator there. audit_logs.user_id references users with NO
   * ACTION, so naming a row this function has already deleted would make the
   * insert fail and the erasure would silently leave no record that it happened.
   */
  const auditActorId = args.actorId === target.id ? null : args.actorId;

  await logAudit({
    action: 'user_hard_deleted',
    entityType: 'user',
    entityId: target.id,
    userId: auditActorId ?? undefined,
    // Deliberately no email, name or phone: this row must not become the trace
    // the erasure was meant to remove.
    metadata: { role: target.role, deletedListings, deletedPhotos },
  }).catch(() => {});

  return { deletedListings, deletedPhotos };
}

/**
 * Remove listing images from Supabase Storage.
 *
 * `listings.photos` is a JSON array of PUBLIC urls, so a row delete alone leaves
 * every image still fetchable by anyone who saved the link. Best-effort: an
 * unreachable storage API must not abort an erasure that has already begun.
 */
async function deleteStoredPhotos(
  rows: Array<{ photos: string | null }>
): Promise<number> {
  const paths: string[] = [];
  for (const row of rows) {
    if (!row.photos) continue;
    try {
      const urls = JSON.parse(row.photos) as unknown;
      if (!Array.isArray(urls)) continue;
      for (const url of urls) {
        if (typeof url !== 'string') continue;
        // ".../object/public/property-images/<path>" -> "<path>"
        const marker = '/property-images/';
        const at = url.indexOf(marker);
        if (at === -1) continue;
        const path = url.slice(at + marker.length).split('?')[0];
        if (path) paths.push(decodeURIComponent(path));
      }
    } catch {
      // A malformed photos blob must not stop the deletion.
    }
  }
  if (paths.length === 0) return 0;

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.storage.from('property-images').remove(paths);
    if (error) {
      console.error('[hardDeleteUser] storage cleanup failed:', error.message);
      return 0;
    }
    return paths.length;
  } catch (err) {
    console.error('[hardDeleteUser] storage cleanup threw:', err);
    return 0;
  }
}
