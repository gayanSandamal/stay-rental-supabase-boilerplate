/**
 * The URL contract shared by every back-office work list.
 *
 * All view state — tab, search, page — lives in `searchParams` and nowhere
 * else. That keeps the screens server-rendered (matching the rest of the app),
 * makes any view linkable so one operator can hand work to another, and makes
 * refresh and the back button behave. No client-only view state.
 */

export const PER_PAGE = 50;

/** Every list caps its page at this, so a bad `?perPage=` cannot melt the DB. */
const MAX_PER_PAGE = 200;

export type ListParams = {
  /** The active status tab. Always one of the caller's declared tabs. */
  tab: string;
  /** Free-text search, trimmed. Empty string means "no search". */
  q: string;
  /** 1-based page number. */
  page: number;
  perPage: number;
  /** Rows to skip — what the query actually needs. */
  offset: number;
  /**
   * Screen-specific filters (business account, city…) that must survive every
   * tab, search and page link. Declared per screen via `extraKeys`.
   */
  extras: Record<string, string>;
};

export type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

/**
 * Parse and clamp. Never throws and never returns an out-of-range value: a
 * hand-edited URL is a normal thing to happen to an internal tool.
 */
export function parseListParams(
  searchParams: RawSearchParams,
  options: {
    tabs: readonly string[];
    defaultTab: string;
    extraKeys?: readonly string[];
  }
): ListParams {
  const rawTab = first(searchParams.tab);
  const tab = options.tabs.includes(rawTab) ? rawTab : options.defaultTab;

  const q = first(searchParams.q).trim().slice(0, 120);

  const parsedPage = Number.parseInt(first(searchParams.page), 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const parsedPerPage = Number.parseInt(first(searchParams.perPage), 10);
  const perPage =
    Number.isFinite(parsedPerPage) && parsedPerPage > 0
      ? Math.min(parsedPerPage, MAX_PER_PAGE)
      : PER_PAGE;

  const extras: Record<string, string> = {};
  for (const key of options.extraKeys ?? []) {
    const value = first(searchParams[key]).trim().slice(0, 120);
    if (value) extras[key] = value;
  }

  return { tab, q, page, perPage, offset: (page - 1) * perPage, extras };
}

/**
 * Build a link to the same list with some params changed.
 *
 * Changing the tab or the search always resets to page 1 — landing on page 7
 * of a filter you just applied is disorienting and usually empty.
 */
export function listHref(
  basePath: string,
  current: ListParams,
  overrides: Partial<Pick<ListParams, 'tab' | 'q' | 'page' | 'extras'>> = {}
): string {
  const next = { ...current, ...overrides };
  const resetsPage =
    (overrides.tab !== undefined && overrides.tab !== current.tab) ||
    (overrides.q !== undefined && overrides.q !== current.q);
  const page = resetsPage ? 1 : next.page;

  const params = new URLSearchParams();
  if (next.tab) params.set('tab', next.tab);
  if (next.q) params.set('q', next.q);
  if (page > 1) params.set('page', String(page));
  if (next.perPage !== PER_PAGE) params.set('perPage', String(next.perPage));
  for (const [key, value] of Object.entries(next.extras ?? {})) {
    if (value) params.set(key, value);
  }

  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** "1–50 of 1,284" — the string that proves nothing was silently truncated. */
export function rangeLabel(params: ListParams, total: number): string {
  if (total === 0) return '0 of 0';
  const from = params.offset + 1;
  const to = Math.min(params.offset + params.perPage, total);
  return `${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}`;
}

export function pageCount(params: ListParams, total: number): number {
  return Math.max(1, Math.ceil(total / params.perPage));
}

/**
 * Turn a grouped `[{ status, n }]` aggregate into a lookup the tabs can read.
 *
 * Counts MUST come from an aggregate over the whole table, never from
 * `rows.length` of a capped page — a count that is bounded by its own LIMIT
 * under-reports exactly when the queue is worst.
 */
export function countsByKey(
  rows: Array<{ status: string | null; n: number }>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    if (row.status) out[row.status] = Number(row.n);
  }
  return out;
}

/** Sum of a counts map, for an "All" tab. */
export function totalOf(counts: Record<string, number>, keys?: readonly string[]): number {
  const entries = keys ? keys.map((k) => counts[k] ?? 0) : Object.values(counts);
  return entries.reduce((a, b) => a + b, 0);
}
