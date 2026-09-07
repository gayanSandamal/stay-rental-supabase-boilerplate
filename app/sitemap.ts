import { db } from '@/lib/db/drizzle';
import { listings, landlords, users } from '@/lib/db/schema';
import { eq, and, or, isNull, isNotNull, gte, desc, max } from 'drizzle-orm';
import type { MetadataRoute } from 'next';
import { SITE_URL, listingUrl, areaUrl, landlordUrl } from '@/lib/seo/urls';
import { eligibleAreas } from '@/lib/seo/area-eligibility';

/*
 * Generated on-request from the DB — never prerendered at build time (the
 * listings query would otherwise run during build and time out).
 */
export const dynamic = 'force-dynamic';

/*
 * ── Why this is ONE file and not a sitemap index ───────────────────────────
 * Next's `generateSitemaps()` was tried and reverted. Two measured problems:
 * it accepts only NUMERIC ids (a string id reaches the handler as a non-string
 * and throws), and — decisively — once it is exported Next stops serving
 * `/sitemap.xml` at all and serves `/sitemap/<n>.xml` instead. That is the URL
 * already submitted to Search Console and already named in robots.txt, so
 * adopting it would 404 the one address search engines have for this site.
 *
 * A single document is correct at this scale anyway: the ceiling is 50,000
 * URLs / 50 MB, and production currently holds one listing. LISTING_LIMIT keeps
 * the total under the ceiling by construction, and the warning below is what
 * tells us the day sharding actually becomes necessary — at which point the
 * right move is a hand-written index route, not generateSitemaps.
 */
const LISTING_LIMIT = 45_000;

/*
 * ── lastmod must be a real modification date, or absent ────────────────────
 * Every entry here used to carry `new Date()`, so each fetch of the sitemap
 * declared that all seven pages had changed at the instant it was requested —
 * two fetches three seconds apart returned two different timestamps for
 * /privacy-policy, which has not changed since March.
 *
 * That is not a harmless white lie. Google USES lastmod (unlike `priority` and
 * `changefreq`, which it ignores outright), and its documented response to a
 * site reporting lastmod unreliably is to stop trusting the field for that site
 * altogether. An always-now timestamp therefore spends credibility to convey
 * nothing.
 *
 * So: pages whose content is driven by listings get the newest listing
 * timestamp, which is genuinely when they last changed. Pages that only change
 * when we deploy get NO lastmod at all — "unknown" is honest, and Google treats
 * an absent lastmod as exactly that.
 */

/** `collection: true` — content changes when listings change. */
const STATIC_ROUTES: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  priority: number;
  collection?: boolean;
}> = [
  { path: '/', changeFrequency: 'daily', priority: 1, collection: true },
  { path: '/listings', changeFrequency: 'daily', priority: 0.9, collection: true },
  { path: '/rentals', changeFrequency: 'daily', priority: 0.8, collection: true },
  { path: '/list-your-property', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/how-to-use', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/privacy-policy', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/terms-of-service', changeFrequency: 'yearly', priority: 0.2 },
];

/**
 * "Live right now" — active AND not expired.
 *
 * One definition, used by both the newest-timestamp aggregate and the URL list,
 * so the freshness date can never describe a different set of listings than the
 * one actually being submitted.
 */
function activeListingWhere() {
  return and(
    eq(listings.status, 'active'),
    or(isNull(listings.expiresAt), gte(listings.expiresAt, new Date()))
  );
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  /*
   * Queries stay STRICTLY SEQUENTIAL — the pool is `max: 1` in production and
   * concurrent queries wedge Supabase's transaction pooler (CLAUDE.md, a3ac4f9).
   * Never Promise.all these.
   */

  /*
   * One aggregate, reused by every collection page. `undefined` while there is
   * no inventory, which is correct: nothing has ever been published, so there
   * is no modification date to report.
   */
  const [newest] = await db
    .select({ at: max(listings.updatedAt) })
    .from(listings)
    .where(activeListingWhere());
  const collectionLastModified = newest?.at ?? undefined;

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: route.path === '/' ? SITE_URL : `${SITE_URL}${route.path}`,
    ...(route.collection && collectionLastModified
      ? { lastModified: collectionLastModified }
      : {}),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  /*
   * ONLY areas that currently clear the inventory threshold. An area below it
   * does not exist — the route 404s — so listing it here would hand Google a
   * sitemap full of 404s, which is how a sitemap stops being trusted as a whole.
   * See lib/seo/area-eligibility.ts.
   */
  const areas = await eligibleAreas();
  const areaEntries: MetadataRoute.Sitemap = areas.map((area) => ({
    url: areaUrl(area.name),
    // Site-wide newest rather than newest-in-this-area: a per-area MAX would be
    // one query per area, and this route already fans out over every eligible
    // one. Slightly conservative (an area page may look fresher than it is) but
    // never a fabricated timestamp, and it costs no extra round trips.
    ...(collectionLastModified ? { lastModified: collectionLastModified } : {}),
    changeFrequency: 'daily',
    // A district aggregates more inventory than a single town within it.
    priority: area.kind === 'district' ? 0.8 : 0.7,
  }));

  /*
   * Public landlord profiles have been indexable and self-canonical since
   * launch but appeared in no sitemap, so they were reachable only by internal
   * link. docs/LAUNCH_TEST_PLAN.md test B2 has expected them here all along.
   *
   * Only landlords with a claimed vanity slug: the UUID publicId form
   * canonicalizes to the slug, so submitting it would contradict the page's own
   * canonical tag.
   */
  const landlordRows = await db
    .select({ slug: landlords.profileSlug, updatedAt: users.updatedAt })
    .from(landlords)
    .innerJoin(users, eq(landlords.userId, users.id))
    .where(and(isNotNull(landlords.profileSlug), isNull(users.deletedAt)));

  const landlordEntries: MetadataRoute.Sitemap = landlordRows
    .filter((r): r is { slug: string; updatedAt: Date } => Boolean(r.slug))
    .map((r) => ({
      url: landlordUrl(r.slug),
      // A real modification date, or none — never a fabricated one.
      ...(r.updatedAt ? { lastModified: r.updatedAt } : {}),
      changeFrequency: 'weekly',
      priority: 0.5,
    }));

  const activeListings = await db
    .select({ id: listings.id, updatedAt: listings.updatedAt })
    .from(listings)
    .where(activeListingWhere())
    .orderBy(desc(listings.id))
    .limit(LISTING_LIMIT);

  if (activeListings.length === LISTING_LIMIT) {
    // The day this fires, split the document — see the note on LISTING_LIMIT.
    console.warn(
      `[sitemap] hit LISTING_LIMIT (${LISTING_LIMIT}); listings are being omitted — time to shard`
    );
  }

  const listingEntries: MetadataRoute.Sitemap = activeListings.map((listing) => ({
    url: listingUrl(listing.id),
    lastModified: listing.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  return [...staticEntries, ...areaEntries, ...landlordEntries, ...listingEntries];
}
