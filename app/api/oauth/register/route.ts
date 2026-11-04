import type { NextRequest } from 'next/server';
import { json, NO_STORE, oauthErrorResponse, preflight } from '@/lib/mcp/http';
import { isAcceptableRedirectUri } from '@/lib/mcp/oauth/config';
import { OAuthError, registerClient, type TokenEndpointAuthMethod } from '@/lib/mcp/oauth/store';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { loadFeatureFlags } from '@/lib/feature-flags-store';

/**
 * POST /api/oauth/register — RFC 7591 dynamic client registration.
 *
 * OPEN BY DESIGN: this is how a Claude connector (or any MCP client) that knows
 * only our URL gets a client_id. Registering grants nothing — a client still
 * needs a signed-in user to approve it on /oauth/authorize, and the consent
 * screen shows the redirect HOST (which we validate) rather than trusting the
 * self-declared client_name.
 */
const AUTH_METHODS: readonly TokenEndpointAuthMethod[] = ['none', 'client_secret_post', 'client_secret_basic'];
const MAX_REDIRECT_URIS = 10;

export async function POST(request: NextRequest) {
  try {
    await loadFeatureFlags();
    if (!isFeatureEnabled('enableMcpConnector')) {
      return json(
        { error: 'temporarily_unavailable', error_description: 'The Easy Rent connector is not enabled' },
        { status: 503, headers: NO_STORE }
      );
    }
    const rl = checkRateLimit(getClientIp(request), 'POST', '/api/oauth/register');
    if (!rl.allowed) return rateLimitResponse(rl.resetAt);

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      throw new OAuthError('invalid_client_metadata', 'Body must be a JSON object');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new OAuthError('invalid_client_metadata', 'Body must be a JSON object');
    }

    const redirectUris = body.redirect_uris;
    if (!Array.isArray(redirectUris) || redirectUris.length === 0 || redirectUris.length > MAX_REDIRECT_URIS) {
      throw new OAuthError('invalid_redirect_uri', `redirect_uris must list 1-${MAX_REDIRECT_URIS} URIs`);
    }
    for (const uri of redirectUris) {
      if (!isAcceptableRedirectUri(uri)) {
        throw new OAuthError(
          'invalid_redirect_uri',
          'Each redirect URI must be https, http on localhost, or a private app scheme, with no fragment'
        );
      }
    }

    const grantTypes = (body.grant_types as unknown[] | undefined) ?? ['authorization_code'];
    if (!Array.isArray(grantTypes) || grantTypes.some((g) => g !== 'authorization_code' && g !== 'refresh_token')) {
      throw new OAuthError('invalid_client_metadata', 'Only authorization_code and refresh_token are supported');
    }
    const responseTypes = (body.response_types as unknown[] | undefined) ?? ['code'];
    if (!Array.isArray(responseTypes) || responseTypes.some((r) => r !== 'code')) {
      throw new OAuthError('invalid_client_metadata', 'Only the "code" response type is supported');
    }

    // RFC 7591 §2: the default when omitted is client_secret_basic.
    const method = (body.token_endpoint_auth_method ?? 'client_secret_basic') as TokenEndpointAuthMethod;
    if (!AUTH_METHODS.includes(method)) {
      throw new OAuthError('invalid_client_metadata', `token_endpoint_auth_method must be one of ${AUTH_METHODS.join(', ')}`);
    }

    const clientName =
      typeof body.client_name === 'string'
        ? body.client_name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100) || null
        : null;
    const clientUri =
      typeof body.client_uri === 'string' && /^https:\/\/[^\s]+$/.test(body.client_uri)
        ? body.client_uri.slice(0, 500)
        : null;

    const { client, clientSecret } = await registerClient({
      redirectUris: redirectUris as string[],
      clientName,
      clientUri,
      tokenEndpointAuthMethod: method,
    });

    return json(
      {
        client_id: client.clientId,
        client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
        ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}),
        client_name: client.clientName ?? undefined,
        client_uri: client.clientUri ?? undefined,
        redirect_uris: redirectUris,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: method,
        scope: 'read write admin',
      },
      { status: 201, headers: NO_STORE }
    );
  } catch (err) {
    return oauthErrorResponse(err);
  }
}

export const OPTIONS = preflight;
