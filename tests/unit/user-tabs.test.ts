import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  accountState,
  DORMANT_AFTER_DAYS,
  USER_TABS,
  USER_TAB_LABELS,
  ACCOUNT_STATE_LABELS,
} from '@/lib/back-office/user-tabs';

const NOW = new Date('2026-09-03T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

/**
 * The whole point of this feature: "inactive" is three different states, and an
 * operator has to act differently on each. If these collapse into one another
 * the page tells them the wrong thing.
 */
describe('accountState — the three kinds of inactive', () => {
  it('a working account that signed in recently is active', () => {
    expect(
      accountState({ deletedAt: null, hasAuthRow: true, lastSignInAt: daysAgo(2) }, NOW)
    ).toBe('active');
  });

  it('a working account that has not signed in lately is dormant', () => {
    expect(
      accountState(
        { deletedAt: null, hasAuthRow: true, lastSignInAt: daysAgo(DORMANT_AFTER_DAYS + 1) },
        NOW
      )
    ).toBe('dormant');
  });

  it('an account with no auth row CANNOT sign in — never merely dormant', () => {
    /*
     * The distinction this test exists for. Production had an ops account in
     * exactly this state: a row in public.users, no auth.users record, so
     * getUser() returns null and the person can never get in. Reporting that as
     * "dormant" tells an operator to wait for someone who cannot arrive.
     */
    expect(
      accountState({ deletedAt: null, hasAuthRow: false, lastSignInAt: null }, NOW)
    ).toBe('no_auth');
  });

  it('deleted wins over every other state', () => {
    // A deleted account is also, technically, not signing in. The most decisive
    // fact has to win or the Deleted tab leaks into Dormant.
    expect(
      accountState({ deletedAt: daysAgo(1), hasAuthRow: false, lastSignInAt: null }, NOW)
    ).toBe('deleted');
    expect(
      accountState({ deletedAt: daysAgo(1), hasAuthRow: true, lastSignInAt: daysAgo(400) }, NOW)
    ).toBe('deleted');
  });

  it('an invited account that can sign in but never has is dormant, not broken', () => {
    // hasAuthRow true + lastSignInAt null = claimable. Different problem from
    // no_auth, and different fix.
    expect(
      accountState({ deletedAt: null, hasAuthRow: true, lastSignInAt: null }, NOW)
    ).toBe('dormant');
  });

  it('the dormancy boundary is not off by a day', () => {
    expect(
      accountState(
        { deletedAt: null, hasAuthRow: true, lastSignInAt: daysAgo(DORMANT_AFTER_DAYS - 1) },
        NOW
      )
    ).toBe('active');
  });

  it('every state a row can take has a label', () => {
    const states = (['active', 'dormant', 'no_auth', 'deleted'] as const).map(
      (s) => ACCOUNT_STATE_LABELS[s]
    );
    expect(states.every((s) => typeof s === 'string' && s.length > 0)).toBe(true);
  });

  it('every tab has a label', () => {
    for (const tab of USER_TABS) {
      expect(USER_TAB_LABELS[tab], `tab "${tab}" has no label`).toBeTruthy();
    }
  });
});

/**
 * The state rule is written twice — once as SQL for filtering and counting,
 * once as TypeScript for the badge. Counting in SQL is what keeps the tab
 * totals honest without fetching every row, but two copies can drift, and a
 * drift means the "Dormant" tab shows a count that disagrees with the rows
 * underneath it. These assert the SQL still encodes the same rule and the same
 * precedence.
 */
describe('the SQL state expression matches the TypeScript one', () => {
  const sqlSource = readFileSync(
    join(process.cwd(), 'lib/back-office/users-query.ts'),
    'utf8'
  );

  it('orders the CASE so deleted wins, then no_auth, then dormant', () => {
    const deleted = sqlSource.indexOf("THEN 'deleted'");
    const noAuth = sqlSource.indexOf("THEN 'no_auth'");
    const dormant = sqlSource.indexOf("THEN 'dormant'");
    expect(deleted).toBeGreaterThan(-1);
    expect(noAuth).toBeGreaterThan(deleted);
    expect(dormant).toBeGreaterThan(noAuth);
  });

  it('keys no_auth off a missing auth row, not off a missing sign-in', () => {
    expect(sqlSource).toContain("WHEN a.id IS NULL THEN 'no_auth'");
  });

  it('uses the shared dormancy constant rather than a hardcoded interval', () => {
    expect(sqlSource).toContain('DORMANT_AFTER_DAYS');
    expect(sqlSource).not.toMatch(/make_interval\(days => \d+\)/);
  });
});

/**
 * The pool is max: 1 in production against Supabase's transaction pooler, where
 * pipelined queries wedge the request (CLAUDE.md, commit a3ac4f9). Same guard
 * as tests/unit/analytics-gates.test.ts.
 */
describe('no concurrent queries on the users path', () => {
  it.each([
    'lib/back-office/users-query.ts',
    'app/(dashboard)/back-office/users/users-list.tsx',
  ])('%s does not use Promise.all', (file) => {
    const src = readFileSync(join(process.cwd(), file), 'utf8')
      // Strip comments first — these files describe the rule in prose, and an
      // un-stripped scan would report the rule as a violation of itself.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(src).not.toContain('Promise.all');
  });
});

/**
 * The email lookup returns a user row to the browser. It used to be
 * `select()` with no column list, which shipped the password hash and the
 * Supabase auth id on every call.
 */
describe('GET /api/user?email= does not leak credentials', () => {
  const src = readFileSync(join(process.cwd(), 'app/api/user/route.ts'), 'utf8');

  it('never selects passwordHash or authUserId', () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('passwordHash');
    expect(code).not.toContain('authUserId');
  });

  it('uses an explicit column list rather than a bare select()', () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/\.select\(\)\s*\n?\s*\.from\(users\)/);
  });
});
