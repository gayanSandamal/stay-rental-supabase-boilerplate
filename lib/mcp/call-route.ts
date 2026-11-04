import { NextRequest } from 'next/server';

/**
 * Invoke one of the app's own route handlers in-process.
 *
 * This is how MCP tools change things: rather than re-implementing listing
 * creation, edit re-approval, ownership checks, moderation queueing, audit
 * logging and the owner notices, a tool builds the same request the dashboard
 * would send and hands it to the same handler. getUser() inside the handler
 * resolves to the MCP user (lib/mcp/principal.ts), so the handler cannot tell
 * the difference and every rule it enforces applies unchanged.
 *
 * Rate limits: route handlers key their limiter on x-forwarded-for. Every
 * connector call arrives from the MCP client's servers — for Claude, a handful
 * of Anthropic IPs shared by every user — so the real IP would put all Easy
 * Rent users of Claude in one bucket. A per-user synthetic key gives each
 * person their own bucket at the same limits a browser gets.
 */
export interface RouteResult<T = any> {
  status: number;
  ok: boolean;
  data: T;
}

type Handler = (
  request: NextRequest,
  context: { params: any }
) => Promise<Response> | Response;

export interface CallRouteInput {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  params?: Record<string, string>;
}

export type CallRoute = <T = any>(handler: Handler, input: CallRouteInput) => Promise<RouteResult<T>>;

export function makeCallRoute(origin: string, userId: number): CallRoute {
  return async function callRoute<T = any>(handler: Handler, input: CallRouteInput): Promise<RouteResult<T>> {
    const url = new URL(input.path, origin);
    for (const [k, v] of Object.entries(input.query ?? {})) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    const headers = new Headers({
      'x-forwarded-for': `mcp-user-${userId}`,
      'user-agent': 'easyrent-mcp',
      accept: 'application/json',
    });
    let body: string | undefined;
    if (input.body !== undefined) {
      headers.set('content-type', 'application/json');
      body = JSON.stringify(input.body);
    }
    const request = new NextRequest(url, { method: input.method, headers, body });
    const response = await handler(request, { params: Promise.resolve(input.params ?? {}) });
    let data: any = null;
    const text = await response.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text.slice(0, 500) };
      }
    }
    return { status: response.status, ok: response.ok, data: data as T };
  };
}

/** The error text a route handler returned, in the shape tools surface it. */
export function routeError(result: RouteResult): string {
  const d = result.data as Record<string, unknown> | null;
  const message =
    (d && typeof d.error === 'string' && d.error) ||
    (d && typeof d.message === 'string' && d.message) ||
    `Request failed with status ${result.status}`;
  const details = d && d.details ? ` (${JSON.stringify(d.details)})` : '';
  const duplicates =
    d && Array.isArray(d.duplicates) && d.duplicates.length
      ? ` Possible duplicates: ${JSON.stringify(d.duplicates)}`
      : '';
  return `${message}${details}${duplicates}`;
}
