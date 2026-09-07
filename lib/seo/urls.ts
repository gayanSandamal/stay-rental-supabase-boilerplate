/**
 * Every public URL Easy Rent emits, built in one place.
 *
 * Before this file, `process.env.NEXT_PUBLIC_BASE_URL ?? 'https://easyrent.lk'`
 * appeared in 14 files and `` `/listings/${id}` `` was written inline at eight
 * call sites. That is fine until the day a URL shape changes — an SEO slug on
 * listings, a locale prefix — and then it is eight edits with no compiler help
 * and a sitemap that silently disagrees with the links on the page.
 *
 * `SITE_URL` keeps the historical fallback so nothing breaks if the env var is
 * unset, but production should set it explicitly (LAUNCH_READINESS item #3).
 */

export const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://easyrent.lk';

/** Absolute URL for a site-relative path. Idempotent for absolute inputs. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Canonical path for one listing. The ONLY place this shape is written. */
export function listingPath(id: number | string): string {
  return `/listings/${id}`;
}

export function listingUrl(id: number | string): string {
  return absoluteUrl(listingPath(id));
}

/**
 * URL-safe form of a Sri Lankan place name.
 *
 * Gazetteer names carry spaces and periods ("Mount Lavinia", "Sri
 * Jayewardenepura Kotte", "Colombo 3"), so the slug has to be derived rather
 * than assumed. Diacritics are stripped via NFD so a name that gains an accent
 * upstream does not silently change its URL.
 */
export function areaSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function areaPath(name: string): string {
  return `/rentals/${areaSlug(name)}`;
}

export function areaUrl(name: string): string {
  return absoluteUrl(areaPath(name));
}

/** Landlord public profile. Slugs live at the ROOT — see lib/reserved-slugs.ts. */
export function landlordPath(slugOrPublicId: string): string {
  return `/${slugOrPublicId}`;
}

export function landlordUrl(slugOrPublicId: string): string {
  return absoluteUrl(landlordPath(slugOrPublicId));
}

export function guidePath(slug: string): string {
  return `/guides/${slug}`;
}

export function guideUrl(slug: string): string {
  return absoluteUrl(guidePath(slug));
}
