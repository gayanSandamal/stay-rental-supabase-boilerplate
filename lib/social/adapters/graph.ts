/**
 * Shared Meta Graph API plumbing for the Facebook Page and Instagram adapters.
 * Both authenticate with the same Page access token.
 */

import { GRAPH_API_BASE, SOCIAL_HTTP_TIMEOUT_MS, socialConfig } from '../config';

export interface GraphError {
  message: string;
  /** Graph's numeric code. 190 = token invalid/expired, 4/17/32/613 = throttled. */
  code?: number;
  subcode?: number;
}

export type GraphResponse<T> = { ok: true; data: T } | { ok: false; error: GraphError };

/**
 * A token problem is never worth retrying — it needs a human to reconnect the
 * Page. Retrying just burns the attempt budget and repeats the same ops alert.
 */
export function isTokenError(error: GraphError): boolean {
  return error.code === 190 || error.code === 102 || error.code === 10;
}

/** Graph's throttling family. The job is fine; the window is full. */
export function isRateLimitError(error: GraphError): boolean {
  return [4, 17, 32, 613, 80001].includes(error.code ?? -1);
}

/**
 * A permission problem (200/294/-anything about roles) is also terminal: the
 * app is missing a reviewed permission, which no retry can fix.
 */
export function isPermissionError(error: GraphError): boolean {
  return error.code === 200 || error.code === 294 || error.code === 3;
}

export async function graphPost<T = Record<string, unknown>>(
  path: string,
  body: Record<string, string>
): Promise<GraphResponse<T>> {
  return graphCall<T>('POST', path, body);
}

/**
 * `accessToken` overrides the Page token for the rare call that cannot use it —
 * `debug_token` wants an app or app-developer token, not the token being
 * inspected. Everything else omits it and authenticates as the Page.
 */
export async function graphGet<T = Record<string, unknown>>(
  path: string,
  query: Record<string, string> = {},
  accessToken?: string
): Promise<GraphResponse<T>> {
  return graphCall<T>('GET', path, query, accessToken);
}

export async function graphDelete<T = Record<string, unknown>>(
  path: string
): Promise<GraphResponse<T>> {
  return graphCall<T>('DELETE', path, {});
}

async function graphCall<T>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  params: Record<string, string>,
  accessToken?: string
): Promise<GraphResponse<T>> {
  const token = accessToken || socialConfig.facebookPageAccessToken;
  if (!token) return { ok: false, error: { message: 'No Page access token configured' } };

  const url = new URL(`${GRAPH_API_BASE}/${path.replace(/^\/+/, '')}`);
  const payload = new URLSearchParams({ ...params, access_token: token });

  try {
    const res = await fetch(method === 'GET' ? `${url}?${payload}` : url.toString(), {
      method,
      ...(method === 'GET'
        ? {}
        : {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: payload.toString(),
          }),
      signal: AbortSignal.timeout(SOCIAL_HTTP_TIMEOUT_MS),
    });

    const json = (await res.json().catch(() => null)) as
      | (T & { error?: { message?: string; code?: number; error_subcode?: number } })
      | null;

    if (!res.ok || json?.error) {
      return {
        ok: false,
        error: {
          message: json?.error?.message ?? `HTTP ${res.status}`,
          code: json?.error?.code,
          subcode: json?.error?.error_subcode,
        },
      };
    }
    if (!json) return { ok: false, error: { message: 'Empty response' } };
    return { ok: true, data: json as T };
  } catch (err) {
    // Timeouts and network faults are transient by nature.
    return {
      ok: false,
      error: { message: err instanceof Error ? err.message : 'Network error' },
    };
  }
}
