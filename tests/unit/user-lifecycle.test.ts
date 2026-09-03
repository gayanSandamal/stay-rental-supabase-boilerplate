import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { accountState } from '@/lib/back-office/user-tabs';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const LIFECYCLE = 'lib/admin/user-lifecycle.ts';

/**
 * THE TEST THAT MATTERS MOST.
 *
 * `scripts/hard-delete-user.ts` handled seven of the foreign keys pointing at
 * `users`, the schema grew five more, and nobody noticed — the delete would have
 * died on a constraint violation *after* already destroying the listings. This
 * asserts the erasure still clears every NO ACTION reference the schema
 * declares, so adding a new one to schema.ts without teaching the eraser about
 * it fails here instead of in production, halfway through.
 */
describe('hard delete clears every blocking foreign key', () => {
  const schema = read('lib/db/schema.ts');
  const src = code(LIFECYCLE);

  // Columns that reference users(id) WITHOUT cascade. Cascading ones need no
  // handling; these block the final DELETE until they are cleared.
  const BLOCKING = [
    ['auditLogs', 'userId'],
    ['businessAccounts', 'createdBy'],
    ['featureFlags', 'updatedBy'],
    ['imageModerationCache', 'overriddenBy'],
    ['impersonationSessions', 'actorUserId'],
    ['impersonationSessions', 'subjectUserId'],
    ['landlords', 'kycVerifiedBy'],
    ['listingSocialPosts', 'pulledBy'],
    ['listingSocialPosts', 'manualTakedownBy'],
    ['listings', 'verifiedBy'],
    ['listings', 'visitedBy'],
    ['listings', 'rejectedBy'],
    ['listings', 'createdBy'],
    ['savedSearches', 'userId'],
    ['socialAccounts', 'connectedBy'],
    ['userContactNumbers', 'verifiedBy'],
    ['users', 'bannedBy'],
  ] as const;

  it.each(BLOCKING)('handles %s.%s', (table, column) => {
    expect(src, `${table}.${column} is never cleared — the DELETE will fail`).toContain(
      `${table}.${column}`
    );
  });

  it('the blocking list still matches what schema.ts declares', () => {
    /*
     * Catches the other direction: a NEW non-cascading reference to users(id)
     * added to schema.ts that this test does not yet know about. It cannot read
     * the live database, so it checks that every `references(() => users.id)`
     * without a cascade is one we have listed.
     */
    // Anchored: `.references` must follow the column directly (allowing only
    // .notNull()/.unique() between), or the window spans into the NEXT field and
    // reports columns that reference nothing.
    const refs = [
      ...schema.matchAll(
        /(\w+):\s*integer\('[^']+'\)\s*(?:\.notNull\(\)\s*|\.unique\(\)\s*)*\.references\(\(\) => users\.id([^)]*)\)/g
      ),
    ];
    const nonCascading = refs
      .filter((m) => !/onDelete:\s*'cascade'/.test(m[0]))
      .map((m) => m[1]);
    const known = new Set(BLOCKING.map(([, col]) => col));
    const unknown = nonCascading.filter((c) => !known.has(c as any));
    expect(unknown, `unhandled non-cascading FK column(s): ${unknown.join(', ')}`).toEqual([]);
  });
});

describe('order of operations', () => {
  const src = code(LIFECYCLE);

  it('pulls social posts down BEFORE deleting listings', () => {
    /*
     * listing_social_posts cascades from listings, and that row is the only
     * handle for removing a live post. Delete first and the post stays up
     * forever with nothing left to take it down with — the opposite of
     * "without a trace".
     */
    const pull = src.indexOf('pullDownForListing');
    const del = src.indexOf('.delete(listings)');
    expect(pull).toBeGreaterThan(-1);
    expect(del).toBeGreaterThan(-1);
    expect(pull).toBeLessThan(del);
  });

  it('removes stored photos, not just the rows that point at them', () => {
    // listings.photos holds PUBLIC urls; a row delete leaves every image
    // fetchable by anyone who saved the link.
    expect(src).toContain('deleteStoredPhotos');
    expect(src).toContain("from('property-images')");
  });

  it('deletes the auth user last', () => {
    const dbDel = src.indexOf('.delete(users)');
    const authDel = src.indexOf('auth.admin.deleteUser');
    expect(dbDel).toBeLessThan(authDel);
  });
});

describe('guards', () => {
  const src = code(LIFECYCLE);

  it('refuses to touch an admin from the UI', () => {
    expect(src).toContain("target.role === 'admin'");
  });

  it('refuses self-targeting from the UI', () => {
    expect(src).toContain('target.id === actorId');
  });

  it('requires the typed email to match before erasing', () => {
    // An id is not a statement of intent when the list may be minutes stale.
    expect(src).toContain('args.confirmEmail.trim().toLowerCase() !== target.email.toLowerCase()');
  });

  it('requires a reason to ban', () => {
    expect(src).toContain("throw new UserLifecycleError('A reason is required.')");
  });

  it('never names the deleted person in the surviving audit row', () => {
    /*
     * The audit entry proves an erasure happened; it must not become the trace
     * the erasure was meant to remove.
     */
    const auditBlock = src.slice(src.indexOf("action: 'user_hard_deleted'"));
    const metadata = auditBlock.slice(0, auditBlock.indexOf('}'));
    expect(metadata).not.toContain('email');
    expect(metadata).not.toContain('name');
    expect(metadata).not.toContain('phone');
  });

  it('does not point the audit row at a user it just deleted', () => {
    // audit_logs.user_id is NO ACTION; naming the deleted row makes the insert
    // fail and the erasure leaves no record at all.
    expect(src).toContain('args.actorId === target.id ? null : args.actorId');
  });
});

describe('banning archives listings', () => {
  const src = code(LIFECYCLE);

  it('archives rather than deletes, so an unban can restore them', () => {
    expect(src).toContain("status: 'archived'");
    // Scoped to banUser's own body — an unscoped search runs on into
    // hardDeleteUser, where deleting listings is correct.
    const banBody = src.slice(
      src.indexOf('export async function banUser'),
      src.indexOf('export async function unbanUser')
    );
    expect(banBody).not.toContain('.delete(listings)');
  });

  it('covers pending as well as active listings', () => {
    // A pending listing would otherwise go live after the ban, via moderation.
    expect(src).toContain("inArray(listings.status, ['active', 'pending'])");
  });

  it('bans at the auth layer too, not only locally', () => {
    expect(src).toContain('ban_duration');
  });
});

describe('a banned account is signed out everywhere', () => {
  it('getUser returns null for a banned user', () => {
    /*
     * This is what makes a ban take effect on the CURRENT session. Supabase's
     * ban only stops new sign-ins; it cannot revoke a token it already signed,
     * and that window is exactly what a ban exists to close. Every one of
     * getUser's ~70 callers already handles null, so the check cannot be
     * forgotten at one of them.
     */
    const src = code('lib/db/queries.ts');
    expect(src).toMatch(/if \(user\.bannedAt\)\s*\{\s*return null;/);
  });

  it('banned outranks no_auth in the displayed state', () => {
    const now = new Date('2026-09-03T12:00:00Z');
    expect(
      accountState(
        { deletedAt: null, bannedAt: now, hasAuthRow: false, lastSignInAt: null },
        now
      )
    ).toBe('banned');
  });

  it('deleted still outranks banned', () => {
    const now = new Date('2026-09-03T12:00:00Z');
    expect(
      accountState({ deletedAt: now, bannedAt: now, hasAuthRow: true, lastSignInAt: now }, now)
    ).toBe('deleted');
  });
});

describe('the CLI and the UI share one implementation', () => {
  it('the script delegates rather than keeping its own copy', () => {
    const script = code('scripts/hard-delete-user.ts');
    expect(script).toContain("from '../lib/admin/user-lifecycle'");
    // The old copy did its own deleting; a second copy is what rotted last time.
    expect(script).not.toContain('.delete(listings)');
    expect(script).not.toContain('.delete(users)');
  });
});

describe('no concurrent queries', () => {
  it('the lifecycle module never uses Promise.all', () => {
    // max: 1 pool on the transaction pooler wedges on pipelined queries.
    expect(code(LIFECYCLE)).not.toContain('Promise.all');
  });
});
