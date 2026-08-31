import 'server-only';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { businessAccounts, landlords, users } from '@/lib/db/schema';
import { publisherDisplayName } from '@/lib/publisher-name';

/**
 * Who published each listing, for a whole page of them, in THREE queries.
 *
 * This existed three times as a `Promise.all` over the result set, each
 * iteration running one or two of its own queries — on the public search page,
 * on its infinite-scroll API, and on the landlord listings page. Fifty results
 * meant up to a hundred concurrent queries onto the `max: 1` pool
 * (lib/db/drizzle.ts) behind Supabase's transaction pooler, which is the wedge
 * commit a3ac4f9 removed from the back office. One copy, set-based, so the
 * pattern cannot quietly come back in one place and not the others.
 *
 * Never renders a synthetic @wa.easyrent.lk address: names go through
 * publisherDisplayName().
 */

export type PublisherInfo = {
  publisherName: string;
  publisherType: 'individual' | 'business';
  teamMemberName: string | null;
  businessAccountName: string | null;
};

type PublishableListing = {
  id: number;
  landlordId: number;
  businessAccountId?: number | null;
  createdBy?: number | null;
};

export async function resolvePublishers<T extends PublishableListing>(
  listings: T[],
  fallbackName: (listing: T) => string = () => 'Unknown'
): Promise<Map<number, PublisherInfo>> {
  const resolved = new Map<number, PublisherInfo>();
  if (listings.length === 0) return resolved;

  const businessAccountIds = [
    ...new Set(listings.map((l) => l.businessAccountId).filter((id): id is number => !!id)),
  ];
  const creatorIds = [
    ...new Set(
      listings
        .filter((l) => l.businessAccountId)
        .map((l) => l.createdBy)
        .filter((id): id is number => !!id)
    ),
  ];
  const landlordIds = [
    ...new Set(listings.filter((l) => !l.businessAccountId).map((l) => l.landlordId)),
  ];

  let accountsById = new Map<number, string>();
  let creatorsById = new Map<number, { name: string | null; email: string }>();
  let landlordNamesById = new Map<number, string>();

  try {
    if (businessAccountIds.length > 0) {
      const rows = await db
        .select({ id: businessAccounts.id, name: businessAccounts.name })
        .from(businessAccounts)
        .where(inArray(businessAccounts.id, businessAccountIds));
      accountsById = new Map(rows.map((r) => [r.id, r.name]));
    }

    if (creatorIds.length > 0) {
      const rows = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(inArray(users.id, creatorIds));
      creatorsById = new Map(rows.map((r) => [r.id, { name: r.name, email: r.email }]));
    }

    if (landlordIds.length > 0) {
      const rows = await db
        .select({ landlordId: landlords.id, name: users.name, email: users.email })
        .from(landlords)
        .innerJoin(users, eq(landlords.userId, users.id))
        .where(inArray(landlords.id, landlordIds));
      landlordNamesById = new Map(
        rows.map((r) => [r.landlordId, publisherDisplayName({ name: r.name, email: r.email })])
      );
    }
  } catch (error) {
    // A publisher name is a nicety; the results are not. Same degradation the
    // per-row try/catch blocks had, minus the fan-out.
    console.error('Error resolving publisher details:', error);
  }

  for (const listing of listings) {
    const accountName = listing.businessAccountId
      ? accountsById.get(listing.businessAccountId)
      : undefined;

    if (accountName) {
      const creator = listing.createdBy ? creatorsById.get(listing.createdBy) : undefined;
      resolved.set(listing.id, {
        publisherName: accountName,
        publisherType: 'business',
        teamMemberName: creator ? publisherDisplayName(creator) : null,
        businessAccountName: accountName,
      });
      continue;
    }

    resolved.set(listing.id, {
      publisherName: landlordNamesById.get(listing.landlordId) ?? fallbackName(listing),
      publisherType: 'individual',
      teamMemberName: null,
      businessAccountName: null,
    });
  }

  return resolved;
}
