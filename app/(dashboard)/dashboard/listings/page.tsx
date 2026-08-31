import { getListingsForOps, getUser } from '@/lib/db/queries';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Shield, MapPin, Eye, Building2, User, Calendar, CheckCircle2 } from 'lucide-react';
import { ListingActionsDropdown } from './listing-actions-dropdown';
import { redirect } from 'next/navigation';
import { resolvePublishers } from '@/lib/listings/publisher-info';
import { getDailyViewCounts, type DailyViewBucket } from '@/lib/db/queries';
import { ViewSparkline } from '@/components/view-sparkline';
import { isFeatureEnabled } from '@/lib/feature-flags';

// Force dynamic rendering to avoid build-time issues
export const dynamic = 'force-dynamic';

export default async function ListingsPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Next 15: searchParams is a Promise and must be awaited before property access.
  const searchParams = await props.searchParams;
  const user = await getUser();
  
  if (!user) {
    redirect('/sign-in');
  }

  const filters = {
    // Only filter by status if explicitly provided in URL, otherwise show active + pending
    status: searchParams.status as 'pending' | 'active' | 'rented' | 'archived' | undefined,
    verified: searchParams.verified === 'true' ? true : undefined,
    limit: 50,
    offset: searchParams.page ? (Number(searchParams.page) - 1) * 50 : 0,
    userId: user.id,
    userRole: user.role,
  };

  const listings = await getListingsForOps(filters);

  /*
   * Publisher names for the whole page in three queries, not two per row.
   *
   * This was a `Promise.all` over the listings, each iteration fetching its own
   * business account and then its own creator — 50 listings could fire 100
   * concurrent queries onto the `max: 1` pool (lib/db/drizzle.ts) behind
   * Supabase's transaction pooler, which is the wedge commit a3ac4f9 removed
   * from the back office and defect D2 removed from the analytics page. The
   * resolver is shared with the two public search paths, which had their own
   * copies of the same fan-out.
   */
  const publishers = await resolvePublishers(
    listings,
    (listing) => listing.landlordUserName || listing.landlordUserEmail || 'Unknown'
  );
  const listingsWithPublisher = listings.map((listing) => ({
    ...listing,
    ...(publishers.get(listing.id) ?? {
      publisherName: 'Unknown',
      publisherType: 'individual' as const,
      teamMemberName: null,
      businessAccountName: null,
    }),
  }));

  /*
   * View counts for EVERY tier, from one grouped query for the whole page.
   *
   * A platform whose model is "free unlimited listings, paid visibility" was
   * withholding the evidence that listing here works at all — a free landlord
   * saw inventory counts and nothing else. The deep comparisons stay on the
   * paid analytics page; the existence of numbers is not what we sell.
   */
  const showViewCounts = isFeatureEnabled('showViewCountsToAllTiers');
  const viewsByListing: Map<number, DailyViewBucket[]> = showViewCounts
    ? await getDailyViewCounts(
        listings.map((l) => l.id),
        30
      )
    : new Map();

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-lg lg:text-2xl font-medium">Listings Management</h1>
        <Button asChild className="bg-orange-500 hover:bg-orange-600">
          <Link href="/dashboard/listings/new">
            <Plus className="mr-2 h-4 w-4" />
            New Listing
          </Link>
        </Button>
      </div>

      {/* The archive flow redirects here with ?removed=1. Without this the
          landlord lands on an unchanged-looking list and cannot tell whether
          the removal worked. */}
      {searchParams.removed === '1' && (
        <div
          role="status"
          className="mb-6 flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4"
        >
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-hidden />
          <div className="text-sm">
            <p className="font-medium text-green-900">Listing removed</p>
            <p className="mt-0.5 text-green-800">
              It is no longer visible to tenants. Changed your mind? Contact us within 30 days and we
              can restore it.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {listingsWithPublisher.map((listing) => (
          <Card key={listing.id} className="hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-lg font-semibold text-gray-900">
                  {listing.title}
                </h3>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    listing.status === 'active'
                      ? 'bg-green-100 text-green-800'
                      : listing.status === 'pending'
                      ? 'bg-yellow-100 text-yellow-800'
                      : listing.status === 'rented'
                      ? 'bg-teal-100 text-teal-900'
                      : listing.status === 'rejected'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {listing.status}
                </span>
              </div>

              <div className="flex items-center text-gray-600 text-sm mb-2">
                <MapPin className="h-4 w-4 mr-1" />
                {listing.city}
              </div>

              <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                <span>{listing.bedrooms} bed</span>
                <span>LKR {Number(listing.rentPerMonth).toLocaleString()}/mo</span>
              </div>

              {showViewCounts && (
                <div className="mb-3">
                  <ViewSparkline buckets={viewsByListing.get(listing.id) ?? []} />
                </div>
              )}

              <div className="border-t pt-3 mb-4">
                <div className="flex items-center text-xs text-gray-500 mb-1">
                  {listing.publisherType === 'business' ? (
                    <Building2 className="h-3 w-3 mr-1" />
                  ) : (
                    <User className="h-3 w-3 mr-1" />
                  )}
                  <span className="font-medium">{listing.publisherName}</span>
                </div>
                {listing.teamMemberName && (
                  <div className="text-xs text-gray-400 ml-4">
                    by {listing.teamMemberName}
                  </div>
                )}
                <div className="flex items-center text-xs text-gray-400 ml-4">
                  <Calendar className="h-3 w-3 mr-1" />
                  {new Date(listing.createdAt).toLocaleDateString()}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {listing.verified && (
                  <span className="inline-flex items-center px-2 py-1 rounded-md bg-green-100 text-green-800 text-xs">
                    <Shield className="h-3 w-3 mr-1" />
                    Verified
                  </span>
                )}
                {listing.visited && (
                  <span className="inline-flex items-center px-2 py-1 rounded-md bg-teal-100 text-teal-900 text-xs">
                    <Eye className="h-3 w-3 mr-1" />
                    Visited
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {user.role === 'admin' || user.role === 'ops' ? (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="flex-1"
                  >
                    <Link href={`/dashboard/listings/${listing.id}`}>
                      Review
                    </Link>
                  </Button>
                ) : (
                  <>
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      <Link href={`/dashboard/listings/${listing.id}/edit`}>
                        Edit
                      </Link>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      <Link href={`/listings/${listing.id}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                  </>
                )}
                <ListingActionsDropdown 
                  listingId={listing.id} 
                  status={listing.status}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {listings.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-gray-600 mb-4">No listings found.</p>
            <Button asChild className="bg-orange-500 hover:bg-orange-600">
              <Link href="/dashboard/listings/new">
                <Plus className="mr-2 h-4 w-4" />
                Create First Listing
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

