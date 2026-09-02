/**
 * The single place URL query params become `getActiveListings` filters.
 *
 * WHY THIS EXISTS. The same truncated key-copy block used to live in four
 * files — the listings page, the paginated API, the client grid and the
 * saved-search cron — and each one honoured the SAME 14 of the 33 filters the
 * form offers. `getActiveListings` implements all 33; nothing passed them. So a
 * renter could filter on "max 2 months deposit, gated, CCTV", watch
 * `active-filters-chips.tsx` render a chip confirming each one, and get results
 * that ignored all three. Saving that search then produced ALERTS that ignored
 * them too. Deposit-in-months and notice period are two of the nineteen, and
 * they are the fields this marketplace claims as its differentiators.
 *
 * A spec table rather than 33 hand-written `if`s, because the bug was never one
 * missing filter — it was four hand-maintained lists drifting from the form
 * config. `tests/unit/filter-params.test.ts` asserts this table and
 * `filterFormConfig` name the same fields in BOTH directions, so a 34th form
 * field added without a spec entry fails CI instead of silently doing nothing.
 */

type FilterKind = 'string' | 'int' | 'boolTrue' | 'sort' | 'radius';

/**
 * Every filter the public form offers, and how its string param is coerced.
 * Keys here are the URL param names, which are also the form field names.
 */
const FILTER_SPEC = {
  search: 'string',
  city: 'string',
  district: 'string',
  locationRadius: 'radius',

  propertyType: 'string',
  bedrooms: 'int',
  bathrooms: 'int',
  minArea: 'int',
  maxArea: 'int',

  minPrice: 'int',
  maxPrice: 'int',
  depositMonths: 'int',
  utilitiesIncluded: 'boolTrue',
  maxServiceCharge: 'int',

  powerBackup: 'string',
  waterSource: 'string',
  minWaterTankSize: 'int',

  hasFiber: 'boolTrue',
  fiberISP: 'string',

  minACUnits: 'int',
  minFans: 'int',
  ventilation: 'string',

  isGated: 'boolTrue',
  hasGuard: 'boolTrue',
  hasCCTV: 'boolTrue',
  hasBurglarBars: 'boolTrue',

  parking: 'boolTrue',
  minParkingSpaces: 'int',
  petsAllowed: 'boolTrue',

  maxNoticePeriod: 'int',

  verifiedOnly: 'boolTrue',
  visitedOnly: 'boolTrue',

  sortBy: 'sort',
} as const satisfies Record<string, FilterKind>;

export type FilterKey = keyof typeof FILTER_SPEC;

/** The 33 param names the form writes. Import this instead of re-listing them. */
export const FILTER_KEYS = Object.keys(FILTER_SPEC) as FilterKey[];

export function isBooleanFilterKey(key: string): boolean {
  return FILTER_SPEC[key as FilterKey] === 'boolTrue';
}

/**
 * The sort values `getActiveListings` actually implements.
 *
 * An unrecognised value must be DROPPED, never defaulted — see the note on
 * `sortBy` below. `newest` is included because a renter may choose it
 * deliberately; it is only the silent default that was dangerous.
 */
const SORT_VALUES = new Set([
  'newest',
  'oldest',
  'price_asc',
  'price_desc',
  'area_desc',
  'area_asc',
  'bedrooms_desc',
  'bedrooms_asc',
]);

export type ListingFilters = NonNullable<Parameters<typeof import('@/lib/db/queries').getActiveListings>[0]>;

export type RawParams =
  | URLSearchParams
  | Record<string, string | string[] | boolean | number | undefined | null>;

function readParam(input: RawParams, key: string): string | undefined {
  if (input instanceof URLSearchParams) {
    return input.get(key) ?? undefined;
  }
  const raw = input[key];
  if (raw === undefined || raw === null) return undefined;
  // Saved searches store a JSON blob, so a legacy row can hold a real boolean
  // or number rather than the string the URL would have carried.
  if (Array.isArray(raw)) return raw[0];
  return String(raw);
}

/**
 * Whole positive integers only.
 *
 * Zero is treated as unset, matching the previous behaviour for every field in
 * this set (`if (params.minPrice)` was falsy at 0) and harmless for all of
 * them — "at least 0 AC units" filters nothing. NaN must never reach the query:
 * today it survives only because `NaN` happens to be falsy at the call site.
 */
function toInt(value: string): number | undefined {
  // Digits only, deliberately stricter than parseInt. `parseInt` stops at the
  // first non-digit, so '12abc' becomes 12 and '1e9999' becomes 1 — a value the
  // renter never asked for, silently applied as a real filter. Every field of
  // this kind is a whole count or an LKR amount, so nothing legitimate is lost.
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n <= 0 || n > 1_000_000_000) return undefined;
  return n;
}

/**
 * ONLY the literal `'true'` sets a boolean filter. Everything else omits it.
 *
 * This asymmetry is load-bearing. `getActiveListings` writes
 * `filters?.parking !== undefined ? eq(listings.parking, filters.parking) : ...`,
 * so emitting `false` would filter FOR listings without parking — the exact
 * inverse of what an unchecked box means. Unchecked is "don't care", never
 * "must be absent".
 */
function toBoolTrue(value: string): true | undefined {
  return value === 'true' ? true : undefined;
}

/**
 * Parse URL params (or a stored saved-search blob) into `getActiveListings`
 * filters.
 *
 * Strictly allow-listed. That is a security property, not tidiness: callers
 * pass raw request params in, and a permissive copy would let anyone set
 * `excludeExclusive=false` (see premium-only listings), `hideNewListingsHours=0`
 * (defeat paid early access), `limit`, `offset`, or the alert cursor. Those keys
 * are set by the caller AFTER this returns, from server-side truth only.
 */
export function parseListingFilters(input: RawParams): ListingFilters {
  const out: Record<string, unknown> = {};

  for (const key of FILTER_KEYS) {
    const kind = FILTER_SPEC[key];
    const raw = readParam(input, key);
    if (raw === undefined || raw === '') continue;

    switch (kind) {
      case 'string': {
        const trimmed = raw.trim();
        if (trimmed) out[key] = trimmed;
        break;
      }
      case 'int': {
        const n = toInt(raw);
        if (n !== undefined) out[key] = n;
        break;
      }
      case 'boolTrue': {
        const b = toBoolTrue(raw);
        if (b !== undefined) out[key] = b;
        break;
      }
      case 'sort': {
        // An unknown value is DROPPED, never defaulted. `getActiveListings`
        // falls through to `desc(createdAt)` for anything it does not
        // recognise, so defaulting here would let `?sortBy=garbage` silently
        // replace the paid-visibility ranking with plain reverse-chronological.
        if (SORT_VALUES.has(raw)) out[key] = raw;
        break;
      }
      case 'radius': {
        // Radius needs coordinates, and nothing in the app supplies them yet.
        // Emitting the radius alone would be another filter that renders a chip
        // and changes nothing — the failure mode this module exists to end.
        const lat = readParam(input, 'latitude');
        const lng = readParam(input, 'longitude');
        if (!lat || !lng) break;
        const latN = Number(lat);
        const lngN = Number(lng);
        if (!Number.isFinite(latN) || !Number.isFinite(lngN)) break;
        out.locationRadius = raw;
        out.latitude = latN;
        out.longitude = lngN;
        break;
      }
    }
  }

  return out as ListingFilters;
}

/**
 * How many filters the renter has actually applied.
 *
 * `sortBy` is excluded: an ordering is not a filter, and counting it made a
 * bare visit to the listings page read as "1 filter active".
 */
export function activeFilterCount(input: RawParams): number {
  let n = 0;
  for (const key of FILTER_KEYS) {
    if (key === 'sortBy') continue;
    const raw = readParam(input, key);
    if (raw === undefined || raw === '') continue;
    if (FILTER_SPEC[key] === 'boolTrue' && raw !== 'true') continue;
    n += 1;
  }
  return n;
}

/**
 * Canonical string form of a filter set, for storing on a saved search.
 *
 * Written at save time so the cron's read can never fail: today a row with
 * unparseable `search_params` is `continue`d on every run, forever, invisibly.
 * Sorted keys also make two identical searches compare equal, which is what any
 * future de-duplication would need.
 */
export function canonicalizeFilterParams(input: RawParams): Record<string, string> {
  const parsed = parseListingFilters(input) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of Object.keys(parsed).sort()) {
    const value = parsed[key];
    if (value === undefined || value === null) continue;
    out[key] = typeof value === 'boolean' ? String(value) : String(value);
  }
  return out;
}
