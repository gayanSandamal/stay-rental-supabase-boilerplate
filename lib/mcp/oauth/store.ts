import 'server-only';
import { and, desc, eq, gt, isNull, lt, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  mcpOauthClients,
  mcpOauthCodes,
  mcpOauthGrants,
  users,
  type McpOauthClient,
  type User,
} from '@/lib/db/schema';
import { logAudit } from '@/lib/db/audit-logger';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTH_CODE_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  TOKEN_PREFIX,
  formatScopes,
  parseScopes,
  randomToken,
  redirectUriMatches,
  safeEqual,
  sha256Hex,
  verifyPkce,
  type Scope,
} from './config';

/**
 * Persistence for the OAuth server. All SQL is strictly sequential — the
 * production pool is `max: 1` on Supabase's transaction pooler, where
 * concurrent queries on one request wedge it (commit a3ac4f9).
 */

export class OAuthError extends Error {
  constructor(
    public readonly code:
      | 'invalid_request'
      | 'invalid_client'
      | 'invalid_grant'
      | 'unauthorized_client'
      | 'unsupported_grant_type'
      | 'invalid_scope'
      | 'invalid_target'
      | 'invalid_redirect_uri'
      | 'invalid_client_metadata'
      | 'access_denied'
      | 'server_error',
    message: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

/* ------------------------------------------------------------------------- */
/* Clients                                                                    */
/* ------------------------------------------------------------------------- */

export type TokenEndpointAuthMethod = 'none' | 'client_secret_post' | 'client_secret_basic';

export async function registerClient(input: {
  redirectUris: string[];
  clientName: string | null;
  clientUri: string | null;
  tokenEndpointAuthMethod: TokenEndpointAuthMethod;
}): Promise<{ client: McpOauthClient; clientSecret: string | null }> {
  const clientId = randomToken(TOKEN_PREFIX.client, 16);
  const clientSecret =
    input.tokenEndpointAuthMethod === 'none' ? null : randomToken(TOKEN_PREFIX.secret);
  const [client] = await db
    .insert(mcpOauthClients)
    .values({
      clientId,
      clientSecretHash: clientSecret ? sha256Hex(clientSecret) : null,
      clientName: input.clientName,
      clientUri: input.clientUri,
      redirectUris: JSON.stringify(input.redirectUris),
      tokenEndpointAuthMethod: input.tokenEndpointAuthMethod,
    })
    .returning();
  return { client, clientSecret };
}

export async function getClient(clientId: string | null | undefined): Promise<McpOauthClient | null> {
  if (!clientId || typeof clientId !== 'string' || clientId.length > 200) return null;
  const [client] = await db
    .select()
    .from(mcpOauthClients)
    .where(eq(mcpOauthClients.clientId, clientId))
    .limit(1);
  return client ?? null;
}

export function clientRedirectUris(client: McpOauthClient): string[] {
  try {
    const parsed = JSON.parse(client.redirectUris);
    return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Confidential clients must prove their secret; public clients must not send
 * one we would then ignore (a client that thinks it is confidential but is not
 * registered as such is misconfigured, and silently accepting would hide it).
 */
export function authenticateClient(client: McpOauthClient, presentedSecret: string | null): void {
  if (client.tokenEndpointAuthMethod === 'none') return;
  if (!presentedSecret || !client.clientSecretHash) {
    throw new OAuthError('invalid_client', 'Client authentication failed', 401);
  }
  if (!safeEqual(sha256Hex(presentedSecret), client.clientSecretHash)) {
    throw new OAuthError('invalid_client', 'Client authentication failed', 401);
  }
}

/* ------------------------------------------------------------------------- */
/* Authorization codes                                                        */
/* ------------------------------------------------------------------------- */

export async function createAuthorizationCode(input: {
  clientId: string;
  userId: number;
  redirectUri: string;
  codeChallenge: string;
  scopes: Scope[];
  resource: string;
}): Promise<string> {
  const code = randomToken(TOKEN_PREFIX.code);
  await db.insert(mcpOauthCodes).values({
    codeHash: sha256Hex(code),
    clientId: input.clientId,
    userId: input.userId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    scope: formatScopes(input.scopes),
    resource: input.resource,
    expiresAt: new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000),
  });
  return code;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

function mintTokenPair() {
  const accessToken = randomToken(TOKEN_PREFIX.access);
  const refreshToken = randomToken(TOKEN_PREFIX.refresh);
  const now = Date.now();
  return {
    accessToken,
    refreshToken,
    accessTokenHash: sha256Hex(accessToken),
    refreshTokenHash: sha256Hex(refreshToken),
    accessExpiresAt: new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000),
    refreshExpiresAt: new Date(now + REFRESH_TOKEN_TTL_SECONDS * 1000),
  };
}

async function liveUser(userId: number): Promise<User | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt), isNull(users.bannedAt)))
    .limit(1);
  return user ?? null;
}

export async function exchangeAuthorizationCode(input: {
  client: McpOauthClient;
  code: string;
  redirectUri: string | null;
  codeVerifier: string | null;
  resource: string | null;
}): Promise<TokenResponse> {
  const codeHash = sha256Hex(input.code);

  // Consume FIRST, atomically. Whatever fails after this, the code is spent —
  // a code is single-use even when the attempt that used it was wrong.
  const [row] = await db
    .update(mcpOauthCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(mcpOauthCodes.codeHash, codeHash), isNull(mcpOauthCodes.consumedAt)))
    .returning();

  if (!row) {
    // Replay of a spent code: revoke whatever it produced (OAuth 2.1 §4.1.3).
    const [spent] = await db
      .select({ grantId: mcpOauthCodes.grantId })
      .from(mcpOauthCodes)
      .where(eq(mcpOauthCodes.codeHash, codeHash))
      .limit(1);
    if (spent?.grantId) {
      await db
        .update(mcpOauthGrants)
        .set({ revokedAt: new Date() })
        .where(and(eq(mcpOauthGrants.id, spent.grantId), isNull(mcpOauthGrants.revokedAt)));
    }
    throw new OAuthError('invalid_grant', 'Authorization code is invalid or has already been used');
  }

  if (row.expiresAt.getTime() < Date.now()) {
    throw new OAuthError('invalid_grant', 'Authorization code has expired');
  }
  if (row.clientId !== input.client.clientId) {
    throw new OAuthError('invalid_grant', 'Authorization code was issued to another client');
  }
  // redirect_uri is REQUIRED at the token endpoint when it was sent to
  // /authorize, which for us is always.
  if (!input.redirectUri || !redirectUriMatches(input.redirectUri, [row.redirectUri])) {
    throw new OAuthError('invalid_grant', 'redirect_uri does not match the authorization request');
  }
  if (!verifyPkce(input.codeVerifier, row.codeChallenge)) {
    throw new OAuthError('invalid_grant', 'PKCE verification failed');
  }
  if (input.resource && input.resource !== row.resource && `${input.resource}`.replace(/\/$/, '') !== row.resource) {
    throw new OAuthError('invalid_target', 'resource does not match the authorization request');
  }

  const user = await liveUser(row.userId);
  if (!user) throw new OAuthError('invalid_grant', 'The account that approved this is no longer active');

  const pair = mintTokenPair();
  const [grant] = await db
    .insert(mcpOauthGrants)
    .values({
      clientId: row.clientId,
      userId: row.userId,
      scope: row.scope,
      resource: row.resource,
      accessTokenHash: pair.accessTokenHash,
      accessExpiresAt: pair.accessExpiresAt,
      refreshTokenHash: pair.refreshTokenHash,
      refreshExpiresAt: pair.refreshExpiresAt,
      lastUsedAt: new Date(),
    })
    .returning({ id: mcpOauthGrants.id });

  await db.update(mcpOauthCodes).set({ grantId: grant.id }).where(eq(mcpOauthCodes.id, row.id));
  await db
    .update(mcpOauthClients)
    .set({ lastUsedAt: new Date() })
    .where(eq(mcpOauthClients.clientId, row.clientId));

  await logAudit({
    action: 'mcp_connector_authorized',
    entityType: 'mcp_grant',
    entityId: grant.id,
    userId: row.userId,
    metadata: {
      clientId: row.clientId,
      clientName: input.client.clientName,
      scope: row.scope,
      redirectHost: safeHost(row.redirectUri),
    },
  });

  return {
    access_token: pair.accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: pair.refreshToken,
    scope: row.scope,
  };
}

/* ------------------------------------------------------------------------- */
/* Refresh                                                                    */
/* ------------------------------------------------------------------------- */

export async function refreshGrant(input: {
  client: McpOauthClient;
  refreshToken: string;
  scope: string | null;
}): Promise<TokenResponse> {
  const oldHash = sha256Hex(input.refreshToken);

  const [grant] = await db
    .select()
    .from(mcpOauthGrants)
    .where(eq(mcpOauthGrants.refreshTokenHash, oldHash))
    .limit(1);

  if (!grant) {
    // A refresh token we already rotated away. Either the client lost a
    // response, or someone else holds a copy — and we cannot tell which, so the
    // grant dies (OAuth 2.1 §4.3.1 refresh-token rotation). The user reconnects.
    const [replayed] = await db
      .select({ id: mcpOauthGrants.id })
      .from(mcpOauthGrants)
      .where(eq(mcpOauthGrants.previousRefreshTokenHash, oldHash))
      .limit(1);
    if (replayed) {
      await db
        .update(mcpOauthGrants)
        .set({ revokedAt: new Date() })
        .where(and(eq(mcpOauthGrants.id, replayed.id), isNull(mcpOauthGrants.revokedAt)));
    }
    throw new OAuthError('invalid_grant', 'Refresh token is invalid');
  }

  if (grant.revokedAt) throw new OAuthError('invalid_grant', 'This connection was revoked');
  if (grant.refreshExpiresAt.getTime() < Date.now()) {
    throw new OAuthError('invalid_grant', 'Refresh token has expired');
  }
  if (grant.clientId !== input.client.clientId) {
    throw new OAuthError('invalid_grant', 'Refresh token was issued to another client');
  }
  const user = await liveUser(grant.userId);
  if (!user) throw new OAuthError('invalid_grant', 'The account behind this connection is no longer active');

  // A refresh may narrow scope, never widen it (RFC 6749 §6).
  let scope = grant.scope;
  const requested = parseScopes(input.scope);
  if (requested) {
    const held = new Set(grant.scope.split(' '));
    if (requested.some((s) => !held.has(s))) {
      throw new OAuthError('invalid_scope', 'Cannot widen scope on refresh');
    }
    scope = formatScopes(requested);
  }

  const pair = mintTokenPair();
  // Compare-and-swap on the old hash, so two concurrent refreshes cannot both win.
  const [rotated] = await db
    .update(mcpOauthGrants)
    .set({
      accessTokenHash: pair.accessTokenHash,
      accessExpiresAt: pair.accessExpiresAt,
      refreshTokenHash: pair.refreshTokenHash,
      previousRefreshTokenHash: oldHash,
      refreshExpiresAt: pair.refreshExpiresAt,
      scope,
      lastUsedAt: new Date(),
    })
    .where(
      and(
        eq(mcpOauthGrants.id, grant.id),
        eq(mcpOauthGrants.refreshTokenHash, oldHash),
        isNull(mcpOauthGrants.revokedAt)
      )
    )
    .returning({ id: mcpOauthGrants.id });

  if (!rotated) throw new OAuthError('invalid_grant', 'Refresh token is invalid');

  return {
    access_token: pair.accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: pair.refreshToken,
    scope,
  };
}

/* ------------------------------------------------------------------------- */
/* Revocation (RFC 7009)                                                      */
/* ------------------------------------------------------------------------- */

/**
 * Revoking either token of a grant revokes the whole grant — there is no
 * useful "keep refreshing but stop calling" state. Unknown tokens are not an
 * error (RFC 7009 §2.2), which also means this endpoint confirms nothing.
 */
export async function revokeToken(client: McpOauthClient, token: string): Promise<void> {
  const hash = sha256Hex(token);
  const [grant] = await db
    .update(mcpOauthGrants)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(mcpOauthGrants.clientId, client.clientId),
        isNull(mcpOauthGrants.revokedAt),
        or(eq(mcpOauthGrants.accessTokenHash, hash), eq(mcpOauthGrants.refreshTokenHash, hash))
      )
    )
    .returning({ id: mcpOauthGrants.id, userId: mcpOauthGrants.userId });
  if (grant) {
    await logAudit({
      action: 'mcp_connector_revoked',
      entityType: 'mcp_grant',
      entityId: grant.id,
      userId: grant.userId,
      metadata: { clientId: client.clientId, via: 'revocation_endpoint' },
    });
  }
}

/* ------------------------------------------------------------------------- */
/* Resource-server side                                                       */
/* ------------------------------------------------------------------------- */

export interface McpAuthContext {
  grantId: number;
  clientId: string;
  scopes: Scope[];
  resource: string;
  user: User;
}

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Bearer token → the user it acts as, or null. One query (grant joined to a
 * live, unbanned user), plus at most one write every five minutes to keep
 * `last_used_at` honest on the Connected apps page without a write per call.
 *
 * A ban or soft-delete takes effect on the next call, the same promise
 * getUser() makes for browser sessions.
 */
export async function resolveAccessToken(token: string): Promise<McpAuthContext | null> {
  if (!token.startsWith(TOKEN_PREFIX.access) || token.length > 200) return null;
  const now = new Date();
  const [row] = await db
    .select({ grant: mcpOauthGrants, user: users })
    .from(mcpOauthGrants)
    .innerJoin(users, eq(users.id, mcpOauthGrants.userId))
    .where(
      and(
        eq(mcpOauthGrants.accessTokenHash, sha256Hex(token)),
        isNull(mcpOauthGrants.revokedAt),
        gt(mcpOauthGrants.accessExpiresAt, now),
        isNull(users.deletedAt),
        isNull(users.bannedAt)
      )
    )
    .limit(1);
  if (!row) return null;

  if (!row.grant.lastUsedAt || now.getTime() - row.grant.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
    await db
      .update(mcpOauthGrants)
      .set({ lastUsedAt: now })
      .where(eq(mcpOauthGrants.id, row.grant.id));
  }

  return {
    grantId: row.grant.id,
    clientId: row.grant.clientId,
    scopes: parseScopes(row.grant.scope) ?? [],
    resource: row.grant.resource,
    user: row.user,
  };
}

/* ------------------------------------------------------------------------- */
/* Connected apps (dashboard)                                                 */
/* ------------------------------------------------------------------------- */

export async function listGrantsForUser(userId: number) {
  return db
    .select({
      id: mcpOauthGrants.id,
      scope: mcpOauthGrants.scope,
      createdAt: mcpOauthGrants.createdAt,
      lastUsedAt: mcpOauthGrants.lastUsedAt,
      refreshExpiresAt: mcpOauthGrants.refreshExpiresAt,
      clientName: mcpOauthClients.clientName,
      redirectUris: mcpOauthClients.redirectUris,
    })
    .from(mcpOauthGrants)
    .innerJoin(mcpOauthClients, eq(mcpOauthClients.clientId, mcpOauthGrants.clientId))
    .where(
      and(
        eq(mcpOauthGrants.userId, userId),
        isNull(mcpOauthGrants.revokedAt),
        gt(mcpOauthGrants.refreshExpiresAt, new Date())
      )
    )
    .orderBy(desc(mcpOauthGrants.createdAt));
}

/** Scoped to the owner in the WHERE clause — a grant id alone revokes nothing. */
export async function revokeGrantForUser(userId: number, grantId: number): Promise<boolean> {
  const [grant] = await db
    .update(mcpOauthGrants)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(mcpOauthGrants.id, grantId),
        eq(mcpOauthGrants.userId, userId),
        isNull(mcpOauthGrants.revokedAt)
      )
    )
    .returning({ id: mcpOauthGrants.id, clientId: mcpOauthGrants.clientId });
  if (!grant) return false;
  await logAudit({
    action: 'mcp_connector_revoked',
    entityType: 'mcp_grant',
    entityId: grant.id,
    userId,
    metadata: { clientId: grant.clientId, via: 'dashboard' },
  });
  return true;
}

/** Housekeeping: spent or expired codes older than a day are useless. */
export async function purgeStaleCodes(): Promise<void> {
  await db
    .delete(mcpOauthCodes)
    .where(lt(mcpOauthCodes.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)));
}

function safeHost(uri: string): string | null {
  try {
    return new URL(uri).host || null;
  } catch {
    return null;
  }
}
