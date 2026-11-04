import type { NextRequest } from 'next/server';
import { json, NO_STORE, oauthErrorResponse, preflight, readBasicAuth, readParams } from '@/lib/mcp/http';
import { OAuthError, authenticateClient, getClient, revokeToken } from '@/lib/mcp/oauth/store';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

/**
 * POST /api/oauth/revoke — RFC 7009. Answers 200 for an unknown token too
 * (§2.2), so it confirms nothing about which tokens exist. Deliberately NOT
 * gated on the feature flag: switching the connector off must never stop a
 * client from cleaning up after itself.
 */
export async function POST(request: NextRequest) {
  try {
    const rl = checkRateLimit(getClientIp(request), 'POST', '/api/oauth/revoke');
    if (!rl.allowed) return rateLimitResponse(rl.resetAt);

    const params = await readParams(request);
    const basic = readBasicAuth(request);
    const clientId = basic?.clientId ?? params.client_id;
    if (!clientId) throw new OAuthError('invalid_client', 'client_id is required', 401);
    const client = await getClient(clientId);
    if (!client) throw new OAuthError('invalid_client', 'Unknown client', 401);
    authenticateClient(client, basic?.clientSecret ?? params.client_secret ?? null);

    if (!params.token) throw new OAuthError('invalid_request', 'token is required');
    await revokeToken(client, params.token);
    return json({}, { headers: NO_STORE });
  } catch (err) {
    return oauthErrorResponse(err);
  }
}

export const OPTIONS = preflight;
