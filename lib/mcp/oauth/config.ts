/**
 * Constants and pure helpers for Easy Rent's OAuth 2.1 authorization server —
 * the thing a Claude custom connector signs in through before it may call /mcp.
 *
 * Nothing in this file touches the database or Next, so every rule here is
 * unit-tested directly (tests/unit/mcp-oauth.test.ts).
 */
import crypto from 'node:crypto';

export const MCP_PATH = '/mcp';

/**
 * read  — public search, plus your own account, listings, saved searches and
 *         notifications.
 * write — change things you own: create/edit/archive your listings, saved
 *         searches, contact numbers, notification read state.
 * admin — back-office tools. Granted only to ops/admin accounts AND only when
 *         the user ticks it on the consent screen; the role is still checked on
 *         every call, so the scope alone never grants anything.
 */
export const SCOPES = ['read', 'write', 'admin'] as const;
export type Scope = (typeof SCOPES)[number];

export const SCOPE_DESCRIPTIONS: Record<Scope, string> = {
  read: 'Search rentals and read your account, listings, saved alerts and notifications',
  write: 'Create, edit and archive your listings, and manage your saved alerts and contact numbers',
  admin: 'Back-office tools: review and approve listings, activate paid visibility, platform stats',
};

/** What a client gets when it does not ask for anything specific. */
export const DEFAULT_SCOPES: Scope[] = ['read', 'write'];

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 60; // 60 days, sliding on rotation
export const AUTH_CODE_TTL_SECONDS = 5 * 60;

/** Tokens carry a prefix so a leaked one is recognisable in logs and scanners. */
export const TOKEN_PREFIX = {
  access: 'er_at_',
  refresh: 'er_rt_',
  code: 'er_ac_',
  client: 'er_client_',
  secret: 'er_cs_',
} as const;

export function randomToken(prefix: string, bytes = 32): string {
  return prefix + crypto.randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Constant-time string compare that tolerates different lengths. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * PKCE, S256 only (OAuth 2.1 removed `plain`). The verifier is 43-128 chars of
 * the unreserved set (RFC 7636 §4.1); anything else is refused rather than
 * hashed, so a malformed verifier can never match by accident.
 */
const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;
const CHALLENGE_RE = /^[A-Za-z0-9\-_]{43}$/;

export function isValidCodeChallenge(challenge: string | null | undefined): boolean {
  return typeof challenge === 'string' && CHALLENGE_RE.test(challenge);
}

export function verifyPkce(verifier: string | null | undefined, challenge: string): boolean {
  if (typeof verifier !== 'string' || !VERIFIER_RE.test(verifier)) return false;
  const computed = crypto.createHash('sha256').update(verifier).digest('base64url');
  return safeEqual(computed, challenge);
}

/**
 * Parse a space-separated scope string into the known scopes, in canonical
 * order. Unknown scopes are DROPPED, not rejected: RFC 6749 lets the server
 * issue fewer scopes than asked, and the token response says which it issued.
 * `null` means the client did not ask, which is different from asking for
 * nothing we know.
 */
export function parseScopes(raw: string | null | undefined): Scope[] | null {
  if (raw === null || raw === undefined || raw.trim() === '') return null;
  const asked = new Set(raw.split(/\s+/).filter(Boolean));
  return SCOPES.filter((s) => asked.has(s));
}

export function formatScopes(scopes: readonly Scope[]): string {
  return SCOPES.filter((s) => scopes.includes(s)).join(' ');
}

/** Roles that may ever hold the admin scope. */
export function canHoldAdminScope(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'ops';
}

/**
 * The scopes a user may grant: what was asked (or the default), minus admin
 * for anyone who is not ops/admin.
 */
export function grantableScopes(requested: Scope[] | null, role: string | null | undefined): Scope[] {
  const base = requested ?? [...DEFAULT_SCOPES, ...(canHoldAdminScope(role) ? (['admin'] as Scope[]) : [])];
  return base.filter((s) => s !== 'admin' || canHoldAdminScope(role));
}

/* ------------------------------------------------------------------------- */
/* Redirect URIs                                                              */
/* ------------------------------------------------------------------------- */

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const FORBIDDEN_SCHEMES = new Set(['javascript:', 'data:', 'file:', 'vbscript:', 'about:', 'blob:', 'ftp:', 'ws:', 'wss:']);

/**
 * Is this an acceptable redirect URI to REGISTER?
 *
 * - https anywhere (claude.ai, claude.com and every other hosted client).
 * - http only on loopback, for native and CLI clients (Claude Code, the MCP
 *   Inspector) — RFC 8252 §7.3.
 * - a private-use scheme for desktop apps (`cursor://…`, `vscode://…`) —
 *   RFC 8252 §7.1 — except the schemes that execute or read locally.
 *
 * Never a fragment (RFC 6749 §3.1.2) and never credentials in the authority,
 * which some parsers and some humans read differently.
 */
export function isAcceptableRedirectUri(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2000) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.hash || raw.includes('#')) return false;
  if (url.username || url.password) return false;
  if (url.protocol === 'https:') return Boolean(url.hostname);
  if (url.protocol === 'http:') return LOOPBACK_HOSTS.has(url.hostname);
  if (FORBIDDEN_SCHEMES.has(url.protocol)) return false;
  // Private-use scheme: letters, digits, + - . only, and at least a host or path.
  return /^[a-z][a-z0-9+.-]*:$/.test(url.protocol) && (Boolean(url.host) || url.pathname.length > 1);
}

/**
 * Does a redirect URI presented at /authorize or /token match a registered one?
 *
 * Exact string match (OAuth 2.1 §2.3.1), with the single RFC 8252 §7.3
 * exception: a loopback redirect may use any PORT, because a native app picks a
 * free port at runtime. Scheme, host and path must still match exactly.
 */
export function redirectUriMatches(presented: string, registered: readonly string[]): boolean {
  if (registered.includes(presented)) return true;
  let p: URL;
  try {
    p = new URL(presented);
  } catch {
    return false;
  }
  if (p.protocol !== 'http:' || !LOOPBACK_HOSTS.has(p.hostname)) return false;
  return registered.some((r) => {
    try {
      const u = new URL(r);
      return (
        u.protocol === 'http:' &&
        u.hostname === p.hostname &&
        u.pathname === p.pathname &&
        u.search === p.search
      );
    } catch {
      return false;
    }
  });
}

/** Host to show on the consent screen — the one fact about a client we can trust. */
export function redirectDisplayHost(redirectUri: string): string {
  try {
    const u = new URL(redirectUri);
    return u.host || `${u.protocol}//`;
  } catch {
    return redirectUri;
  }
}

/* ------------------------------------------------------------------------- */
/* Origins                                                                    */
/* ------------------------------------------------------------------------- */

/**
 * The public origin this request reached us on. Issuer, resource and every
 * metadata URL derive from it, so a preview deployment advertises its own URLs
 * instead of production's, and a token minted on one host is refused on
 * another (the grant stores the resource it was issued for).
 *
 * Vercel validates the Host header against the deployment's domains, so it is
 * safe to read here.
 */
export function originFromHeaders(headers: Headers): string {
  const host = headers.get('x-forwarded-host') ?? headers.get('host');
  if (!host) return process.env.NEXT_PUBLIC_BASE_URL ?? 'https://easyrent.lk';
  const proto =
    headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ??
    (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export function resourceFor(origin: string): string {
  return `${origin}${MCP_PATH}`;
}

/**
 * RFC 8707: a client names the resource it wants a token for. We serve exactly
 * one, so anything else is refused; an absent value means ours. Trailing slash
 * tolerated because clients normalise differently.
 */
export function resourceMatches(requested: string | null | undefined, origin: string): boolean {
  if (requested === null || requested === undefined || requested === '') return true;
  const ours = resourceFor(origin);
  return requested === ours || requested === `${ours}/` || requested === origin || requested === `${origin}/`;
}
