/**
 * Which /listings URLs may enter the index, and what each one points at.
 *
 * ── The problem this solves ────────────────────────────────────────────────
 * `/listings` builds its canonical FROM its own query string, so every filter
 * combination was self-canonical and indexable. With `search` being free text
 * that is an infinite set of near-identical thin pages, all competing with each
 * other and with the pages we actually want ranked. Crawl budget on a site with
 * single-digit inventory is not a theoretical concern.
 *
 * ── The policy ─────────────────────────────────────────────────────────────
 * A URL earns indexation only if a renter could plausibly search for it AND it
 * describes a stable, repeatable slice of inventory:
 *
 *   /listings                     index   (the hub)
 *   ?propertyType=house           index   (three values, stable, real intent)
 *   ?bedrooms=3                   index   (five values, stable, real intent)
 *   ?propertyType=x&bedrooms=n    index   ("3 bedroom houses" is a real query)
 *   ?city=Kandy                   NOINDEX → canonical to /rentals/kandy when
 *                                  that page is live, else to /listings
 *   ?search=<free text>           NOINDEX (unbounded)
 *   price ranges, amenity toggles NOINDEX (unbounded, low intent)
 *   sortBy / pagination           NOINDEX (same set, different order)
 *   3+ filters, or zero results   NOINDEX (thin by construction)
 *
 * `follow` is kept on EVERY noindex variant. The pages still link to real
 * listings, and dropping follow would strand that equity for no benefit.
 *
 * City filters deliberately hand their equity to `/rentals/<city>` rather than
 * competing with it — one strong page per place, not two weak ones.
 */

import { activeFilterCount, parseListingFilters, type RawParams } from '@/lib/listings/filter-params';
import { absoluteUrl, areaPath } from './urls';

/** Param sets that stay indexable on /listings. Anything else is noindex. */
const INDEXABLE_KEYS = new Set(['propertyType', 'bedrooms']);

/**
 * Property types a listing can actually HAVE.
 *
 * The filter form also offers `villa` and `townhouse`, but no write path can
 * produce them (the create form is house|apartment|room), so those URLs can
 * only ever be empty. Indexing a permanently-empty page is the definition of
 * thin content.
 */
const INDEXABLE_PROPERTY_TYPES = new Set(['house', 'apartment', 'room']);

const MAX_INDEXABLE_FILTERS = 2;

export type Indexability = {
  /** Absolute canonical URL. */
  canonical: string;
  /** Feed straight into Next's `metadata.robots`. */
  robots: { index: boolean; follow: boolean };
};

export type IndexabilityInput = {
  params: RawParams;
  /**
   * Number of results the page will render. Pass when known — a filter
   * combination with nothing in it is thin whatever its shape. Omit when the
   * count is not available without an extra query; the shape rules still apply.
   */
  resultCount?: number;
  /**
   * Cities that currently have a live `/rentals/<city>` page. A `?city=` filter
   * canonicalizes there when the page exists, and to `/listings` when it does
   * not — never to a URL that would 404.
   */
  liveAreaCities?: ReadonlySet<string>;
};

const NOINDEX = { index: false, follow: true } as const;
const INDEX = { index: true, follow: true } as const;

export function listingsIndexability(input: IndexabilityInput): Indexability {
  const filters = parseListingFilters(input.params) as Record<string, unknown>;
  const keys = Object.keys(filters).filter((k) => k !== 'sortBy');
  const listingsUrl = absoluteUrl('/listings');

  // Bare hub.
  if (keys.length === 0) {
    // `?sortBy=` alone reorders the same set — canonical to the unsorted hub.
    return { canonical: listingsUrl, robots: INDEX };
  }

  // A city filter belongs to its area page, which is the stronger surface.
  if (typeof filters.city === 'string') {
    const city = filters.city;
    const hasAreaPage = input.liveAreaCities?.has(city.toLowerCase()) ?? false;
    return {
      canonical: hasAreaPage ? absoluteUrl(areaPath(city)) : listingsUrl,
      robots: NOINDEX,
    };
  }

  // Free text is unbounded by definition.
  if (typeof filters.search === 'string') {
    return { canonical: listingsUrl, robots: NOINDEX };
  }

  const allIndexableKeys = keys.every((k) => INDEXABLE_KEYS.has(k));
  const typeIsReal =
    typeof filters.propertyType !== 'string' ||
    INDEXABLE_PROPERTY_TYPES.has(filters.propertyType);
  const withinBudget = activeFilterCount(input.params) <= MAX_INDEXABLE_FILTERS;
  const hasResults = input.resultCount === undefined || input.resultCount > 0;

  if (allIndexableKeys && typeIsReal && withinBudget && hasResults) {
    const qs = new URLSearchParams();
    // Fixed key order so the same filter set always yields the same canonical.
    if (filters.propertyType) qs.set('propertyType', String(filters.propertyType));
    if (filters.bedrooms) qs.set('bedrooms', String(filters.bedrooms));
    return { canonical: `${listingsUrl}?${qs.toString()}`, robots: INDEX };
  }

  return { canonical: listingsUrl, robots: NOINDEX };
}
