import { db } from '@/lib/db/drizzle';
import { listings } from '@/lib/db/schema';
import { eq, and, or, isNull, gte } from 'drizzle-orm';
import type { MetadataRoute } from 'next';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://stayrental.lk';

  const activeListings = await db
    .select({ id: listings.id, updatedAt: listings.updatedAt })
    .from(listings)
    .where(
      and(
        eq(listings.status, 'active'),
        or(isNull(listings.expiresAt), gte(listings.expiresAt, new Date()))
      )
    );

  const listingEntries: MetadataRoute.Sitemap = activeListings.map((listing) => ({
    url: `${baseUrl}/listings/${listing.id}`,
    lastModified: listing.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/listings`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/list-your-property`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/sign-in`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/privacy-policy`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.2,
    },
    {
      url: `${baseUrl}/terms-of-service`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.2,
    },
    ...listingEntries,
  ];
}
