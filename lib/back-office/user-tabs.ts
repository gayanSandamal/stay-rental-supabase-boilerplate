/**
 * The states a user account can be in, for the back-office users list.
 *
 * "ACTIVE VS INACTIVE" IS THREE DIFFERENT THINGS, AND COLLAPSING THEM IS THE BUG.
 * Ops acts differently on each, so they are separate tabs rather than one
 * toggle:
 *
 *   deleted   — `users.deleted_at` is set. The person asked to leave; account
 *               deletion mutates the email and soft-deletes rather than
 *               removing the row (app/(login)/actions.ts).
 *   no_auth   — there is no `auth.users` row behind this account, so `getUser()`
 *               (which bridges on auth_user_id) returns null and the person can
 *               NEVER sign in. This is broken, not dormant, and it is invisible
 *               everywhere else in the product. Production had one such ops
 *               account sitting unusable with nothing to surface it.
 *   dormant   — a real, working account that simply has not signed in lately.
 *
 * Reporting a broken account as "inactive" would tell an operator to wait for
 * someone who physically cannot arrive.
 */

/** A user is dormant after this long without signing in. */
export const DORMANT_AFTER_DAYS = 30;

export const USER_TABS = [
  'all',
  'tenant',
  'landlord',
  'staff',
  'dormant',
  'no_auth',
  'deleted',
] as const;

export type UserTab = (typeof USER_TABS)[number];

export const USER_TAB_LABELS: Record<UserTab, string> = {
  all: 'All',
  tenant: 'Tenants',
  landlord: 'Landlords',
  staff: 'Ops & Admin',
  dormant: 'Dormant',
  no_auth: 'Cannot sign in',
  deleted: 'Deleted',
};

/**
 * Tabs that should draw the eye when non-zero.
 *
 * `no_auth` only: an account that cannot sign in is a defect someone has to
 * repair. Dormancy is normal, and deletion is a completed request — neither is
 * a queue.
 */
export const URGENT_USER_TABS: ReadonlySet<string> = new Set(['no_auth']);

export type UserRow = {
  id: number;
  name: string | null;
  email: string;
  role: string;
  waPhone: string | null;
  subscriptionTier: string | null;
  createdAt: Date;
  deletedAt: Date | null;
  /** Null when there is no auth.users row at all — see `accountState`. */
  lastSignInAt: Date | null;
  hasAuthRow: boolean;
};

export type AccountState = 'deleted' | 'no_auth' | 'dormant' | 'active';

/**
 * The single place a row's state is decided, so the tab counts, the tab filter
 * and the badge in the table can never disagree about the same user.
 *
 * Order matters and is deliberate: a deleted account is reported as deleted
 * even though it is also, technically, not signing in. The most decisive fact
 * wins.
 */
export function accountState(row: {
  deletedAt: Date | null;
  hasAuthRow: boolean;
  lastSignInAt: Date | null;
}, now: Date = new Date()): AccountState {
  if (row.deletedAt) return 'deleted';
  if (!row.hasAuthRow) return 'no_auth';
  const cutoff = now.getTime() - DORMANT_AFTER_DAYS * 24 * 60 * 60 * 1000;
  // Never signed in, but CAN — an invited account nobody has claimed yet.
  if (!row.lastSignInAt) return 'dormant';
  return row.lastSignInAt.getTime() < cutoff ? 'dormant' : 'active';
}

export const ACCOUNT_STATE_LABELS: Record<AccountState, string> = {
  active: 'Active',
  dormant: 'Dormant',
  no_auth: 'Cannot sign in',
  deleted: 'Deleted',
};
