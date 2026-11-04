import type { NextRequest } from 'next/server';
import { json, NO_STORE, oauthErrorResponse, preflight, readBasicAuth, readParams } from '@/lib/mcp/http';
import {
  OAuthError,
  authenticateClient,
  exchangeAuthorizationCode,
  getClient,
  purgeStaleCodes,
  refreshGrant,
} from '@/lib/mcp/oauth/store';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { loadFeatureFlags } from '@/lib/feature-flags-store';

/**
 * POST /api/oauth/token — authorization_code (PKCE S256) and refresh_token.
 *
 * Refresh tokens rotate on every use; presenting a rotated-away one revokes the
 * grant (see refreshGrant). Every response is no-store.
 */
export async function POST(request: NextRequest) {
  try {
    await loadFeatureFlags();
    if (!isFeatureEnabled('enableMcpConnector')) {
      return json(
        { error: 'temporarily_unavailable', error_description: 'The Easy Rent connector is not enabled' },
        { status: 503, headers: NO_STORE }
      );
    }
    const rl = checkRateLimit(getClientIp(request), 'POST', '/api/oauth/token');
    if (!rl.allowed) return rateLimitResponse(rl.resetAt);

    const params = await readParams(request);
    const basic = readBasicAuth(request);
    if (basic && params.client_id && params.client_id !== basic.clientId) {
      throw new OAuthError('invalid_request', 'client_id in the body does not match the Authorization header');
    }
    const clientId = basic?.clientId ?? params.client_id;
    if (!clientId) throw new OAuthError('invalid_client', 'client_id is required', 401);

    const client = await getClient(clientId);
    if (!client) throw new OAuthError('invalid_client', 'Unknown client', 401);
    authenticateClient(client, basic?.clientSecret ?? params.client_secret ?? null);

    let tokens;
    switch (params.grant_type) {
      case 'authorization_code':
        if (!params.code) throw new OAuthError('invalid_request', 'code is required');
        tokens = await exchangeAuthorizationCode({
          client,
          code: params.code,
          redirectUri: params.redirect_uri ?? null,
          codeVerifier: params.code_verifier ?? null,
          resource: params.resource ?? null,
        });
        break;
      case 'refresh_token':
        if (!params.refresh_token) throw new OAuthError('invalid_request', 'refresh_token is required');
        tokens = await refreshGrant({
          client,
          refreshToken: params.refresh_token,
          scope: params.scope ?? null,
        });
        break;
      default:
        throw new OAuthError('unsupported_grant_type', 'grant_type must be authorization_code or refresh_token');
    }

    // Opportunistic housekeeping — sequential, after the answer is decided.
    if (Math.random() < 0.02) await purgeStaleCodes().catch(() => {});

    return json(tokens, { headers: NO_STORE });
  } catch (err) {
    return oauthErrorResponse(err);
  }
}

export const OPTIONS = preflight;
