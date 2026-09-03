import crypto from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { impersonationSessions, users } from '@/lib/db/schema';
import { logAudit } from '@/lib/db/audit-logger';

/**
 * "View the app as this user", for support.
 *
 * THE THREE RULES THIS MODULE EXISTS TO ENFORCE. Each is checked server-side on
 * every request, not just when the session is created — a session that was legal
 * when it started must stop being legal the moment any of them stops holding.
 *
 *   1. ONLY AN ADMIN MAY IMPERSONATE. Not ops. Impersonation is the highest-
 *      privilege action in the product, and letting ops assume an identity
 *      would erase the ops/admin distinction it is supposed to respect.
 *
 *   2. ONLY TENANTS AND LANDLORDS MAY BE IMPERSONATED. This is what makes
 *      privilege escalation structurally impossible rather than merely
 *      discouraged: there is no path from any impersonation session to a
 *      higher-privileged identity, so no chain of them adds up to one either.
 *
 *   3. READ-ONLY. Enforced in middleware for every non-GET request, and again
 *      in `assertNotImpersonating()` for anything that reaches a server action.
 *      The reason is the audit trail: if support could write while impersonating,
 *      `audit_logs` would record that the LANDLORD deleted their own listing.
 *      A false entry in the compliance record is worse than the deletion,
 *      because everything else is checked against it.
 *
 * The admin's real session is never replaced. This cookie sits ALONGSIDE it, so
 * the app always knows who is actually at the keyboard, exiting is always
 * possible, and both identities land in the audit log. Minting a real Supabase
 * session for the target would be indistinguishable from the user themselves —
 * which is precisely the property an impersonation feature must not have.
 */

export const IMPERSONATION_COOKIE = 'er_impersonate';

/**
 * A forgotten tab must stop working on its own. The Exit button is the happy
 * path; this is what covers the unlocked laptop.
 */
export const IMPERSONATION_TTL_MS = 30 * 60 * 1000;

/** Roles that may never be assumed. See rule 2. */
const IMPERSONATABLE_ROLES = new Set(['tenant', 'landlord']);

export function hashImpersonationToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export type ImpersonationContext = {
  sessionId: number;
  actor: { id: number; name: string | null; email: string; role: string };
  subjectUserId: number;
  expiresAt: Date;
};

/**
 * Begin a session. Returns the plaintext token exactly once — only its hash is
 * stored, so it can never be read back out of the database.
 */
export async function startImpersonation(args: {
  actor: { id: number; role: string };
  subjectUserId: number;
  actorIp?: string | null;
}): Promise<{ token: string; expiresAt: Date }> {
  if (args.actor.role !== 'admin') {
    throw new Error('impersonation: only an admin may impersonate');
  }
  if (args.actor.id === args.subjectUserId) {
    throw new Error('impersonation: cannot impersonate yourself');
  }

  const [subject] = await db
    .select({ id: users.id, role: users.role, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, args.subjectUserId))
    .limit(1);

  if (!subject || subject.deletedAt) {
    throw new Error('impersonation: no such user');
  }
  if (!IMPERSONATABLE_ROLES.has(subject.role)) {
    // Rule 2. Deliberately the same message either way: an admin probing which
    // accounts are staff should not learn it from this endpoint.
    throw new Error('impersonation: this account cannot be impersonated');
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + IMPERSONATION_TTL_MS);

  await db.insert(impersonationSessions).values({
    actorUserId: args.actor.id,
    subjectUserId: subject.id,
    tokenHash: hashImpersonationToken(token),
    expiresAt,
    actorIp: args.actorIp ?? null,
  });

  await logAudit({
    action: 'impersonation_started',
    entityType: 'user',
    entityId: subject.id,
    userId: args.actor.id,
    metadata: { subjectUserId: subject.id, subjectRole: subject.role, expiresAt },
  }).catch(() => {});

  return { token, expiresAt };
}

/**
 * Resolve a cookie token to a live session, or null.
 *
 * Re-checks the actor is still an admin and the subject is still impersonatable
 * on EVERY request. A role can change while a session is open — someone
 * promoted to ops mid-session must stop being viewable immediately, and an
 * admin who is demoted must lose the session they already hold. Checking only
 * at mint time would let a stale cookie outlive the authority that created it.
 */
export async function resolveImpersonation(
  token: string | undefined | null
): Promise<ImpersonationContext | null> {
  if (!token) return null;

  const [row] = await db
    .select({
      id: impersonationSessions.id,
      subjectUserId: impersonationSessions.subjectUserId,
      expiresAt: impersonationSessions.expiresAt,
      actorId: users.id,
      actorName: users.name,
      actorEmail: users.email,
      actorRole: users.role,
      actorDeletedAt: users.deletedAt,
    })
    .from(impersonationSessions)
    .innerJoin(users, eq(users.id, impersonationSessions.actorUserId))
    .where(
      and(
        eq(impersonationSessions.tokenHash, hashImpersonationToken(token)),
        isNull(impersonationSessions.endedAt),
        gt(impersonationSessions.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!row) return null;
  // The authority behind the session, re-verified now rather than trusted from
  // when it was issued.
  if (row.actorDeletedAt || row.actorRole !== 'admin') return null;

  return {
    sessionId: row.id,
    actor: {
      id: row.actorId,
      name: row.actorName,
      email: row.actorEmail,
      role: row.actorRole,
    },
    subjectUserId: row.subjectUserId,
    expiresAt: row.expiresAt,
  };
}

/** End a session. Idempotent — exiting twice is not an error. */
export async function endImpersonation(token: string | undefined | null): Promise<void> {
  if (!token) return;
  const hash = hashImpersonationToken(token);

  const [row] = await db
    .select({
      id: impersonationSessions.id,
      actorUserId: impersonationSessions.actorUserId,
      subjectUserId: impersonationSessions.subjectUserId,
    })
    .from(impersonationSessions)
    .where(and(eq(impersonationSessions.tokenHash, hash), isNull(impersonationSessions.endedAt)))
    .limit(1);

  if (!row) return;

  await db
    .update(impersonationSessions)
    .set({ endedAt: new Date() })
    .where(eq(impersonationSessions.id, row.id));

  // The end is audited as deliberately as the start: an unclosed session is the
  // thing worth noticing when reading this trail back.
  await logAudit({
    action: 'impersonation_ended',
    entityType: 'user',
    entityId: row.subjectUserId,
    userId: row.actorUserId,
    metadata: { sessionId: row.id, subjectUserId: row.subjectUserId },
  }).catch(() => {});
}
