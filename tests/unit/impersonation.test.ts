import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  IMPERSONATION_COOKIE,
  IMPERSONATION_TTL_MS,
  hashImpersonationToken,
} from '@/lib/auth/impersonation';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
/** These files explain the rules in prose; an un-stripped scan would read the
 *  explanation of a rule as a violation of it. */
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('token handling', () => {
  it('stores only a hash — the plaintext token is never persisted', () => {
    const src = code('lib/auth/impersonation.ts');
    // Every write of tokenHash must be the hashed form.
    expect(src).toContain('tokenHash: hashImpersonationToken(token)');
    expect(src).not.toMatch(/tokenHash:\s*token\b/);
  });

  it('hashes deterministically and does not echo the input', () => {
    const h = hashImpersonationToken('abc');
    expect(h).toBe(hashImpersonationToken('abc'));
    expect(h).not.toContain('abc');
    expect(h).toHaveLength(64);
  });

  it('mints from a CSPRNG, not Math.random', () => {
    expect(code('lib/auth/impersonation.ts')).toContain('crypto.randomBytes(32)');
    expect(code('lib/auth/impersonation.ts')).not.toContain('Math.random');
  });
});

describe('rule 1 — only an admin may impersonate', () => {
  const lib = code('lib/auth/impersonation.ts');
  const route = code('app/api/impersonation/start/route.ts');

  it('the library refuses a non-admin actor', () => {
    expect(lib).toContain("args.actor.role !== 'admin'");
  });

  it('the route refuses a non-admin actor too', () => {
    // Both layers, so reaching the library from anywhere else cannot bypass it.
    expect(route).toContain("actor.role !== 'admin'");
  });

  it('re-checks the actor is STILL an admin on every request', () => {
    /*
     * A session must not outlive the authority that created it. An admin who is
     * demoted mid-session has to lose the session they already hold, so the
     * check cannot live only at mint time.
     */
    expect(lib).toContain("row.actorRole !== 'admin'");
  });
});

describe('rule 2 — only tenants and landlords may be impersonated', () => {
  const lib = code('lib/auth/impersonation.ts');

  it('restricts the target roles', () => {
    expect(lib).toContain("IMPERSONATABLE_ROLES = new Set(['tenant', 'landlord'])");
    expect(lib).toContain('IMPERSONATABLE_ROLES.has(subject.role)');
  });

  it('never lists ops or admin as impersonatable', () => {
    // This is what makes privilege escalation structurally impossible rather
    // than merely discouraged: no session can reach a higher-privileged
    // identity, so no chain of them can either.
    const set = lib.match(/IMPERSONATABLE_ROLES = new Set\(\[([^\]]*)\]\)/)?.[1] ?? '';
    expect(set).not.toContain('ops');
    expect(set).not.toContain('admin');
  });

  it('refuses self-impersonation', () => {
    expect(lib).toContain('args.actor.id === args.subjectUserId');
  });
});

describe('rule 3 — impersonation is read-only', () => {
  const mw = code('middleware.ts');

  it('middleware blocks every unsafe method while the cookie is present', () => {
    expect(mw).toContain("request.method === 'GET' || request.method === 'HEAD'");
    expect(mw).toContain("request.cookies.has('er_impersonate')");
    expect(mw).toContain('status: 403');
  });

  it('exempts only the exit route, so there is always a way out', () => {
    expect(mw).toContain('IMPERSONATION_EXIT_PATH');
    expect(mw).toContain("'/api/impersonation/exit'");
  });

  it('the middleware cookie name matches the one the library sets', () => {
    // A silent rename on either side would disable the read-only rule entirely
    // while every test that mocks its own cookie kept passing.
    expect(IMPERSONATION_COOKIE).toBe('er_impersonate');
    expect(mw).toContain(IMPERSONATION_COOKIE);
  });

  it('there is a server-side guard for paths middleware cannot see', () => {
    const guard = code('lib/auth/assert-not-impersonating.ts');
    expect(guard).toContain('impersonatedBy');
    expect(guard).toContain('throw new Error');
  });
});

describe('the audit trail records BOTH identities', () => {
  const lib = code('lib/auth/impersonation.ts');

  it('logs the start against the acting admin, not the subject', () => {
    /*
     * The whole reason writes are blocked. If the subject were recorded as the
     * actor, audit_logs would contain a false statement — and it is the table
     * everything else is checked against.
     */
    expect(lib).toContain("action: 'impersonation_started'");
    expect(lib).toContain('userId: args.actor.id');
  });

  it('logs the end as deliberately as the start', () => {
    // An unclosed session is the thing worth noticing when reading this back.
    expect(lib).toContain("action: 'impersonation_ended'");
    expect(lib).toContain('userId: row.actorUserId');
  });

  it('the migration stores both actor and subject as columns', () => {
    const sql = read('lib/db/migrations/0051_impersonation_sessions.sql');
    expect(sql).toContain('actor_user_id');
    expect(sql).toContain('subject_user_id');
  });

  it('does not cascade-delete the record when an admin is removed', () => {
    // Deleting an admin must not erase the evidence that they impersonated
    // someone.
    const sql = read('lib/db/migrations/0051_impersonation_sessions.sql');
    expect(sql).not.toMatch(/actor_user_id[^,]*ON DELETE CASCADE/i);
  });
});

describe('rule 4 — sessions expire on their own', () => {
  it('has a bounded TTL', () => {
    expect(IMPERSONATION_TTL_MS).toBeGreaterThan(0);
    // Long enough to be useful, short enough to cover a walked-away laptop.
    expect(IMPERSONATION_TTL_MS).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it('enforces expiry in the query, not only in the cookie', () => {
    // A browser that ignores maxAge must still get nothing.
    const lib = code('lib/auth/impersonation.ts');
    expect(lib).toContain('gt(impersonationSessions.expiresAt, new Date())');
    expect(lib).toContain('isNull(impersonationSessions.endedAt)');
  });
});

describe('getUser integration', () => {
  const src = code('lib/db/queries.ts');

  it('only resolves impersonation for an admin', () => {
    expect(src).toContain("self.role === 'admin'");
  });

  it('only honours a session opened by this same admin', () => {
    // A cookie carried to another admin's browser must do nothing.
    expect(src).toContain('ctx.actor.id === self.id');
  });

  it('skips the lookup entirely when no cookie is present', () => {
    // Ordinary requests must not pay a query for a feature they never use —
    // this runs on a max: 1 pool where every extra query is serialised latency.
    expect(src).toMatch(/if \(impersonationToken && self\.role === 'admin'\)/);
  });

  it('always exposes impersonatedBy so callers can tell', () => {
    expect(src).toContain('impersonatedBy: null');
  });
});
