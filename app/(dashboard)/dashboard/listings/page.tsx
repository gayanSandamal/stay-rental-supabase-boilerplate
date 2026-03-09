import { getListingsForOps, getUser } from '@/lib/db/queries';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Shield, MapPin, Eye, Building2, User, Calendar } from 'lucide-react';
import { ListingActionsDropdown } from './listing-actions-dropdown';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { businessAccounts, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// Force dynamic rendering to avoid build-time issues
export const dynamic = 'force-dynamic';

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
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

  // Fetch additional data for business accounts and creators
  const listingsWithPublisher = await Promise.all(
    listings.map(async (listing) => {
      let publisherName = listing.landlordUserName || listing.landlordUserEmail || 'Unknown';
      let publisherType: 'individual' | 'business' = 'individual';
      let teamMemberName: string | null = null;
      let businessAccountName: string | null = null;

      // Check if listing was created by a business account
      if (listing.businessAccountId) {
        try {
          const businessAccount = await db.query.businessAccounts.findFirst({
            where: eq(businessAccounts.id, listing.businessAccountId),
          });
          
          if (businessAccount) {
            publisherType = 'business';
            businessAccountName = businessAccount.name;
            publisherName = businessAccount.name;

            // Get the team member who created it
            if (listing.createdBy) {
              const creator = await db.query.users.findFirst({
                where: eq(users.id, listing.createdBy),
              });
              teamMemberName = creator?.name || creator?.email || null;
            }
          }
        } catch (error) {
          console.error('Error fetching business account:', error);
        }
      }

      return {
        ...listing,
        publisherName,
        publisherType,
        teamMemberName,
        businessAccountName,
      };
    })
  );

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

