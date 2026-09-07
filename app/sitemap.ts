import { db } from '@/lib/db/drizzle';
import { listings, landlords, users } from '@/lib/db/schema';
import { eq, and, or, isNull, isNotNull, gte, desc } from 'drizzle-orm';
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

/** Fixed pages that always exist, independent of inventory. */
const STATIC_ROUTES: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  priority: number;
}> = [
  { path: '/', changeFrequency: 'daily', priority: 1 },
  { path: '/listings', changeFrequency: 'daily', priority: 0.9 },
  { path: '/rentals', changeFrequency: 'daily', priority: 0.8 },
  { path: '/list-your-property', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/how-to-use', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/privacy-policy', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/terms-of-service', changeFrequency: 'yearly', priority: 0.2 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: route.path === '/' ? SITE_URL : `${SITE_URL}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  /*
   * Queries stay STRICTLY SEQUENTIAL — the pool is `max: 1` in production and
   * concurrent queries wedge Supabase's transaction pooler (CLAUDE.md, a3ac4f9).
   * Never Promise.all these.
   */

  /*
   * ONLY areas that currently clear the inventory threshold. An area below it
   * does not exist — the route 404s — so listing it here would hand Google a
   * sitemap full of 404s, which is how a sitemap stops being trusted as a whole.
   * See lib/seo/area-eligibility.ts.
   */
  const areas = await eligibleAreas();
  const areaEntries: MetadataRoute.Sitemap = areas.map((area) => ({
    url: areaUrl(area.name),
    lastModified: now,
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
      lastModified: r.updatedAt ?? now,
      changeFrequency: 'weekly',
      priority: 0.5,
    }));

  const activeListings = await db
    .select({ id: listings.id, updatedAt: listings.updatedAt })
    .from(listings)
    .where(
      and(
        eq(listings.status, 'active'),
        or(isNull(listings.expiresAt), gte(listings.expiresAt, new Date()))
      )
    )
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
