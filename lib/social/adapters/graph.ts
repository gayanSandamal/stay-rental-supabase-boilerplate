/**
 * Shared Meta Graph API plumbing for the Facebook Page and Instagram adapters.
 * Both authenticate with the same Page access token.
 */

import { GRAPH_API_BASE, SOCIAL_HTTP_TIMEOUT_MS, socialConfig } from '../config';

/**
 * Insights reads pin their OWN Graph version, deliberately newer than
 * GRAPH_API_BASE.
 *
 * `(#100) The value must be a valid insights metric` does not only mean "that
 * metric is retired" — it also fires for a metric the REQUESTED VERSION has
 * never heard of. Meta retired the `post_impressions` family and introduced the
 * replacements on a version boundary (`impressions`/`video_views` gave way to
 * `views` in v22.0), so on v21.0 both the old names and the new ones are
 * invalid and every Facebook figure reads unknown forever. Observed on listing
 * 34: `post_media_view` still returned #100 on 2026-09-11 while the code was
 * already asking for the "current" name.
 *
 * Scoped to insights on purpose. GRAPH_API_BASE is shared with the live
 * WhatsApp intake pipeline and with social PUBLISHING, both of which work today
 * — a version bump there is a much larger blast radius than a read that is
 * already failing.
 */
export const GRAPH_INSIGHTS_API_BASE =
  process.env.SOCIAL_INSIGHTS_GRAPH_API_BASE ?? 'https://graph.facebook.com/v26.0';

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
  accessToken?: string,
  apiBase?: string
): Promise<GraphResponse<T>> {
  return graphCall<T>('GET', path, query, accessToken, apiBase);
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
  accessToken?: string,
  apiBase?: string
): Promise<GraphResponse<T>> {
  const token = accessToken || socialConfig.facebookPageAccessToken;
  if (!token) return { ok: false, error: { message: 'No Page access token configured' } };

  const url = new URL(`${apiBase ?? GRAPH_API_BASE}/${path.replace(/^\/+/, '')}`);
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

/**
 * Read the first of `metricNames` that Graph will actually answer for a node.
 *
 * The fallback chain is not defensive padding — Meta retires insight metrics on
 * a version boundary and the replacement is named differently per surface
 * (`post_impressions` on a Page post became `views` on Instagram media, and
 * `impressions` was removed outright for media created after July 2024). A
 * single hardcoded metric name therefore breaks silently on a Graph version
 * bump, months after the deploy that "worked".
 *
 * Returns null when none of them answered, so the caller stores "unknown"
 * rather than zero.
 */
export async function graphInsightValue(
  nodeId: string,
  metricNames: string[]
): Promise<{ value: number } | { error: GraphError; permanent: boolean }> {
  let last: GraphError = { message: 'No metric requested' };
  for (const metric of metricNames) {
    const res = await graphGet<{
      data?: Array<{ name?: string; values?: Array<{ value?: unknown }> }>;
    }>(`${nodeId}/insights`, { metric }, undefined, GRAPH_INSIGHTS_API_BASE);

    if (!res.ok) {
      last = res.error;
      // A token or permission failure is the same for every metric in the list;
      // trying the rest just repeats it against a live rate limit.
      if (isTokenError(res.error) || isPermissionError(res.error)) {
        return { error: res.error, permanent: true };
      }
      if (isRateLimitError(res.error)) return { error: res.error, permanent: false };
      continue;
    }

    const raw = res.data.data?.[0]?.values?.[0]?.value;
    // Graph answers a known-but-empty metric with an absent value. That is not
    // zero views, it is no reading — a brand-new post whose insights have not
    // been computed yet reads exactly like this.
    if (typeof raw === 'number' && Number.isFinite(raw)) return { value: raw };
    /*
     * The payload goes into the message on purpose.
     *
     * "No value" covers two very different situations that are impossible to
     * tell apart from the outside: a metric Graph knows but has not computed,
     * and one whose answer simply is not a bare number (several return a
     * breakdown object, and some need an explicit `period`). The access token
     * is a Vercel *sensitive* variable, so it cannot be exported to probe this
     * by hand — recording the shape here makes the next sweeper pass the probe
     * instead, which is what `metrics_error` is for.
     */
    const shape = JSON.stringify(res.data.data?.[0] ?? res.data) ?? 'undefined';
    last = { message: `No value for ${metric}: ${shape.slice(0, 240)}` };
  }
  return { error: last, permanent: false };
}
