import { NextResponse } from 'next/server';
import { OAuthError } from './oauth/store';
import { originFromHeaders, resourceFor, MCP_PATH } from './oauth/config';

/**
 * CORS for the machine-facing endpoints (/mcp, metadata, register, token,
 * revoke). `*` is safe here precisely because none of them read cookies: every
 * credential is a bearer token or a client secret in the body, which a hostile
 * page cannot obtain by being cross-origin. The consent screen is NOT in this
 * list — it rides on the browser session and keeps the app's normal headers.
 */
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version',
  'Access-Control-Max-Age': '86400',
};

export function preflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export function json(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return NextResponse.json(body, {
    status: init.status ?? 200,
    headers: { ...CORS_HEADERS, ...(init.headers ?? {}) },
  });
}

/** Token-endpoint responses must never be cached (RFC 6749 §5.1). */
export const NO_STORE = { 'Cache-Control': 'no-store', Pragma: 'no-cache' };

export function oauthErrorResponse(err: unknown): NextResponse {
  if (err instanceof OAuthError) {
    const headers: Record<string, string> = { ...NO_STORE };
    if (err.status === 401) headers['WWW-Authenticate'] = 'Basic realm="easyrent"';
    return json({ error: err.code, error_description: err.message }, { status: err.status, headers });
  }
  console.error('[oauth] unexpected error', err);
  return json(
    { error: 'server_error', error_description: 'Something went wrong' },
    { status: 500, headers: NO_STORE }
  );
}

/**
 * OAuth endpoints speak application/x-www-form-urlencoded (RFC 6749 §4.1.3).
 * JSON is accepted too because several MCP clients send it, and refusing a
 * well-formed request over its encoding helps no one.
 */
export async function readParams(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get('content-type') ?? '';
  const out: Record<string, string> = {};
  try {
    if (type.includes('application/json')) {
      const body = (await request.json()) as Record<string, unknown>;
      for (const [k, v] of Object.entries(body ?? {})) {
        if (typeof v === 'string') out[k] = v;
        else if (typeof v === 'number' || typeof v === 'boolean') out[k] = String(v);
      }
    } else {
      const form = new URLSearchParams(await request.text());
      for (const [k, v] of form) out[k] = v;
    }
  } catch {
    throw new OAuthError('invalid_request', 'Request body could not be parsed');
  }
  return out;
}

/** client_secret_basic: `Authorization: Basic base64(urlencode(id):urlencode(secret))`. */
export function readBasicAuth(request: Request): { clientId: string; clientSecret: string } | null {
  const header = request.headers.get('authorization');
  if (!header?.toLowerCase().startsWith('basic ')) return null;
  try {
    const decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    if (idx < 0) return null;
    return {
      clientId: decodeURIComponent(decoded.slice(0, idx)),
      clientSecret: decodeURIComponent(decoded.slice(idx + 1)),
    };
  } catch {
    return null;
  }
}

export function protectedResourceMetadataUrl(origin: string): string {
  return `${origin}/.well-known/oauth-protected-resource${MCP_PATH}`;
}

/**
 * 401 for /mcp. The WWW-Authenticate header is the whole discovery mechanism
 * (MCP authorization spec + RFC 9728 §5.1): it is how a client that knows only
 * the URL finds the authorization server.
 */
export function mcpUnauthorized(request: Request, tokenPresented: boolean): NextResponse {
  const origin = originFromHeaders(request.headers);
  const description = tokenPresented
    ? 'Your Easy Rent connection has expired or was revoked. Reconnect to continue.'
    : 'Sign in to Easy Rent to use this connector';
  // RFC 6750 §3.1: no `error` attribute when the request carried no credentials.
  const params = [
    `realm="easyrent"`,
    `resource_metadata="${protectedResourceMetadataUrl(origin)}"`,
    ...(tokenPresented ? [`error="invalid_token"`, `error_description="${description}"`] : []),
  ];
  const challenge = `Bearer ${params.join(', ')}`;
  return json(
    {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32001, message: description },
    },
    { status: 401, headers: { 'WWW-Authenticate': challenge } }
  );
}

export function mcpInsufficientScope(request: Request, scope: string): NextResponse {
  const origin = originFromHeaders(request.headers);
  return json(
    { jsonrpc: '2.0', id: null, error: { code: -32001, message: `This needs the "${scope}" permission` } },
    {
      status: 403,
      headers: {
        'WWW-Authenticate': `Bearer realm="easyrent", error="insufficient_scope", scope="${scope}", resource_metadata="${protectedResourceMetadataUrl(origin)}"`,
      },
    }
  );
}

export { resourceFor };
