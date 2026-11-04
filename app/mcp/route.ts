import { NextResponse, type NextRequest } from 'next/server';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { checkRateLimit } from '@/lib/rate-limit';
import { makeCallRoute } from '@/lib/mcp/call-route';
import { CORS_HEADERS, json, mcpUnauthorized, preflight } from '@/lib/mcp/http';
import { originFromHeaders, resourceFor } from '@/lib/mcp/oauth/config';
import { resolveAccessToken } from '@/lib/mcp/oauth/store';
import { runAsMcpUser } from '@/lib/mcp/principal';
import {
  RPC,
  SUPPORTED_PROTOCOL_VERSIONS,
  dispatch,
  rpcError,
  type JsonRpcResponse,
} from '@/lib/mcp/server';
import { ALL_TOOLS } from '@/lib/mcp/tools';
import type { ToolContext } from '@/lib/mcp/types';

/**
 * POST /mcp — Easy Rent's MCP server (Streamable HTTP, stateless JSON mode).
 *
 * Connect it in Claude as a custom connector with the URL
 * https://easyrent.lk/mcp; the 401 below is what starts the OAuth sign-in.
 * See docs/mcp-connector.md.
 *
 * Request lifecycle:
 *   1. flag check (enableMcpConnector) — 503 when off
 *   2. bearer token → live, unbanned user (one query); 401 + WWW-Authenticate
 *      pointing at the protected-resource metadata otherwise
 *   3. per-user rate limit
 *   4. every JSON-RPC message dispatched inside runAsMcpUser, so the app's own
 *      route handlers that tools call see this user from getUser()
 *
 * The middleware matcher excludes /mcp: it would otherwise spend a Supabase
 * auth round trip on every call looking for a cookie that is never there.
 */
export const maxDuration = 60;

const ALLOW = 'POST, OPTIONS';

export async function POST(request: NextRequest) {
  await loadFeatureFlags();
  if (!isFeatureEnabled('enableMcpConnector')) {
    return json(rpcError(null, -32000, 'The Easy Rent connector is not enabled right now.'), { status: 503 });
  }

  // MCP-Protocol-Version is sent on every request after initialize. An
  // unsupported one is a 400 per the transport spec; absent means 2025-03-26.
  const version = request.headers.get('mcp-protocol-version');
  if (version && !(SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(version)) {
    return json(rpcError(null, RPC.INVALID_REQUEST, `Unsupported MCP-Protocol-Version: ${version}`), { status: 400 });
  }

  const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)\s*$/i)?.[1];
  if (!token) return mcpUnauthorized(request, false);

  const origin = originFromHeaders(request.headers);
  const auth = await resolveAccessToken(token);
  // A token is bound to the host it was issued on (RFC 8707 audience): one
  // minted on a preview deployment must not work against production.
  if (!auth || auth.resource !== resourceFor(origin)) return mcpUnauthorized(request, true);

  const rl = checkRateLimit(`mcp-user-${auth.user.id}`, 'POST', '/mcp');
  if (!rl.allowed) {
    return json(rpcError(null, -32000, 'Too many requests. Wait a minute and try again.'), {
      status: 429,
      headers: { 'Retry-After': String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))) },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(rpcError(null, RPC.PARSE_ERROR, 'Parse error: body must be JSON'), { status: 400 });
  }

  const ctx: ToolContext = {
    user: auth.user,
    scopes: auth.scopes,
    origin,
    callRoute: makeCallRoute(origin, auth.user.id),
  };

  return runAsMcpUser(auth.user, async () => {
    // Batches (allowed in 2025-03-26) are processed IN ORDER, one at a time —
    // never Promise.all, on a `max: 1` pool.
    if (Array.isArray(body)) {
      if (body.length === 0) {
        return json(rpcError(null, RPC.INVALID_REQUEST, 'Empty batch'), { status: 400 });
      }
      const responses: JsonRpcResponse[] = [];
      for (const message of body) {
        const r = await dispatch(message, { tools: ALL_TOOLS, ctx });
        if (r) responses.push(r);
      }
      return responses.length ? json(responses) : new NextResponse(null, { status: 202, headers: CORS_HEADERS });
    }

    const response = await dispatch(body, { tools: ALL_TOOLS, ctx });
    // A notification (or a client's response) gets 202 with no body.
    return response ? json(response) : new NextResponse(null, { status: 202, headers: CORS_HEADERS });
  });
}

/**
 * No server-initiated stream: this server never pushes, so GET is 405 — which
 * the Streamable HTTP spec defines as the way to say exactly that. Same for
 * DELETE, since no session is ever issued to end.
 */
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { ...CORS_HEADERS, Allow: ALLOW } });
}

export async function DELETE() {
  return new NextResponse(null, { status: 405, headers: { ...CORS_HEADERS, Allow: ALLOW } });
}

export const OPTIONS = preflight;
