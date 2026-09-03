import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';
import { DORMANT_AFTER_DAYS, type UserRow, type UserTab } from './user-tabs';

/**
 * The users list, joined to Supabase Auth.
 *
 * WHY RAW SQL. Everything that makes an account interesting to an operator —
 * whether it can sign in at all, and when it last did — lives in `auth.users`,
 * which Supabase owns and `lib/db/schema.ts` therefore does not model. Drizzle
 * can only name tables it has a schema for, so the join is written by hand.
 *
 * WHY NOT THE SUPABASE ADMIN API. `auth.admin.listUsers()` is the "supported"
 * route, but it is an HTTPS round trip that paginates on its own cursor, which
 * would have to be reconciled against a separate SQL page of `public.users`.
 * One join returns the truth in one round trip on a pool that is `max: 1` in
 * production — see the navigation-performance notes in CLAUDE.md for what
 * per-query latency costs here.
 *
 * The trade-off worth knowing: this reads a Supabase-managed schema. It works
 * today through the app's own connection; if Supabase ever restricts that
 * grant, the fallback is the admin API, and only this file changes.
 *
 * Queries are sequential, never concurrent — `max: 1` against the transaction
 * pooler wedges on pipelined queries (CLAUDE.md, commit a3ac4f9).
 */

/** The dormancy cutoff, as a SQL interval the DB can compare against. */
const dormantCutoff = sql`now() - make_interval(days => ${DORMANT_AFTER_DAYS})`;

/**
 * The state expression, mirroring `accountState()` in user-tabs.ts.
 *
 * It exists twice — once in SQL for filtering and counting, once in TypeScript
 * for rendering the badge — because counting in SQL and labelling in TS is the
 * only way to get honest totals without fetching every row. The unit tests
 * assert the two agree; if you change one, change both.
 */
const stateExpr = sql`
  CASE
    WHEN u.deleted_at IS NOT NULL THEN 'deleted'
    WHEN u.banned_at IS NOT NULL THEN 'banned'
    WHEN a.id IS NULL THEN 'no_auth'
    WHEN a.last_sign_in_at IS NULL THEN 'dormant'
    WHEN a.last_sign_in_at < ${dormantCutoff} THEN 'dormant'
    ELSE 'active'
  END`;

function tabPredicate(tab: UserTab) {
  switch (tab) {
    case 'tenant':
      return sql`u.deleted_at IS NULL AND u.role = 'tenant'`;
    case 'landlord':
      return sql`u.deleted_at IS NULL AND u.role = 'landlord'`;
    case 'staff':
      return sql`u.deleted_at IS NULL AND u.role IN ('ops','admin')`;
    case 'dormant':
      return sql`(${stateExpr}) = 'dormant'`;
    case 'no_auth':
      return sql`(${stateExpr}) = 'no_auth'`;
    case 'banned':
      return sql`u.deleted_at IS NULL AND u.banned_at IS NOT NULL`;
    case 'deleted':
      return sql`u.deleted_at IS NOT NULL`;
    /*
     * "All" deliberately excludes deleted accounts. A soft-deleted row keeps a
     * mutated email and exists only so the deletion is auditable; listing it by
     * default would make every count look wrong to an operator and put a
     * departed person's row in front of them for no reason. The Deleted tab is
     * where they live.
     */
    case 'all':
    default:
      return sql`u.deleted_at IS NULL`;
  }
}

function searchPredicate(q: string) {
  if (!q) return sql`TRUE`;
  const like = `%${q}%`;
  const asId = Number.parseInt(q.replace(/^#/, ''), 10);
  const idClause =
    Number.isFinite(asId) && asId > 0 ? sql`OR u.id = ${asId}` : sql``;
  return sql`(u.name ILIKE ${like} OR u.email ILIKE ${like} OR u.wa_phone ILIKE ${like} ${idClause})`;
}

export async function getBackOfficeUsers(opts: {
  tab: UserTab;
  q: string;
  limit: number;
  offset: number;
}): Promise<{ rows: UserRow[]; total: number }> {
  const where = sql`${tabPredicate(opts.tab)} AND ${searchPredicate(opts.q)}`;

  const rows = await db.execute(sql`
    SELECT u.id, u.name, u.email, u.role::text AS role, u.wa_phone,
           u.subscription_tier, u.created_at, u.deleted_at,
           u.banned_at, u.banned_reason,
           a.last_sign_in_at,
           (a.id IS NOT NULL) AS has_auth_row
    FROM users u
    LEFT JOIN auth.users a ON a.id = u.auth_user_id
    WHERE ${where}
    ORDER BY u.created_at DESC
    LIMIT ${opts.limit} OFFSET ${opts.offset}
  `);

  const totals = await db.execute(sql`
    SELECT count(*)::int AS n
    FROM users u
    LEFT JOIN auth.users a ON a.id = u.auth_user_id
    WHERE ${where}
  `);

  return {
    rows: (rows as unknown as any[]).map((r) => ({
      id: Number(r.id),
      name: r.name ?? null,
      email: String(r.email),
      role: String(r.role),
      waPhone: r.wa_phone ?? null,
      subscriptionTier: r.subscription_tier ?? null,
      createdAt: new Date(r.created_at),
      deletedAt: r.deleted_at ? new Date(r.deleted_at) : null,
      bannedAt: r.banned_at ? new Date(r.banned_at) : null,
      bannedReason: r.banned_reason ?? null,
      lastSignInAt: r.last_sign_in_at ? new Date(r.last_sign_in_at) : null,
      hasAuthRow: Boolean(r.has_auth_row),
    })),
    total: Number((totals as unknown as any[])[0]?.n ?? 0),
  };
}

/**
 * Counts for every tab, in ONE aggregate over the whole table.
 *
 * Never derived from `rows.length` of a capped page — a count bounded by its
 * own LIMIT under-reports exactly when the list is longest, which is when the
 * number matters most. Same rule as `countsByKey` in list-params.ts.
 */
export async function getBackOfficeUserCounts(): Promise<Record<string, number>> {
  const rows = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE u.deleted_at IS NULL)::int AS all,
      count(*) FILTER (WHERE u.deleted_at IS NULL AND u.role = 'tenant')::int AS tenant,
      count(*) FILTER (WHERE u.deleted_at IS NULL AND u.role = 'landlord')::int AS landlord,
      count(*) FILTER (WHERE u.deleted_at IS NULL AND u.role IN ('ops','admin'))::int AS staff,
      count(*) FILTER (WHERE (${stateExpr}) = 'dormant')::int AS dormant,
      count(*) FILTER (WHERE (${stateExpr}) = 'no_auth')::int AS no_auth,
      count(*) FILTER (WHERE u.deleted_at IS NULL AND u.banned_at IS NOT NULL)::int AS banned,
      count(*) FILTER (WHERE u.deleted_at IS NOT NULL)::int AS deleted
    FROM users u
    LEFT JOIN auth.users a ON a.id = u.auth_user_id
  `);
  const r = (rows as unknown as any[])[0] ?? {};
  return {
    all: Number(r.all ?? 0),
    tenant: Number(r.tenant ?? 0),
    landlord: Number(r.landlord ?? 0),
    staff: Number(r.staff ?? 0),
    dormant: Number(r.dormant ?? 0),
    no_auth: Number(r.no_auth ?? 0),
    banned: Number(r.banned ?? 0),
    deleted: Number(r.deleted ?? 0),
  };
}
