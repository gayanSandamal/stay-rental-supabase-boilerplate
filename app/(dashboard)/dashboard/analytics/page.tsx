import { redirect } from 'next/navigation';
import { getUser, getUserWithLandlord, getLandlordPortfolioData, getRentComparisonForListing, getListingPerformanceData } from '@/lib/db/queries';
import { getLandlordPlanTier } from '@/lib/landlord-plans';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { BarChart3, TrendingUp, Eye, Calendar, ArrowRight } from 'lucide-react';
import { BulkRenewButton } from '@/components/bulk-renew-button';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const userWithLandlord = await getUserWithLandlord(user.id);
  const landlord = userWithLandlord?.landlord;
  const tier = landlord ? getLandlordPlanTier(landlord) : 'free';

  if (tier !== 'premium' && tier !== 'agency') {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Analytics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-600 mb-4">
              Rent comparison, listing performance, and portfolio insights are available on Premium and Agency plans.
            </p>
            <Link
              href="/#pricing"
              className="inline-flex items-center gap-2 text-teal-600 font-medium hover:underline"
            >
              Upgrade to Premium
              <ArrowRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!landlord) {
    return (
      <div className="p-6">
        <p className="text-slate-600">Create a listing to see your analytics.</p>
      </div>
    );
  }

  const portfolio = await getLandlordPortfolioData(landlord.id);

  const listingsWithInsights = await Promise.all(
    portfolio.listings.map(async (listing) => {
      const [rentComp, perf] = await Promise.all([
        getRentComparisonForListing(listing.id),
        getListingPerformanceData(listing.id),
      ]);
      return { listing, rentComp, perf };
    })
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 className="h-6 w-6" />
          Analytics
        </h1>
        <p className="text-slate-600 mt-1">Rent comparison, performance, and portfolio insights</p>
      </div>

      {/* Portfolio summary */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Listings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{portfolio.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{portfolio.active}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{portfolio.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Expiring Soon</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-2xl font-bold text-orange-600">{portfolio.expiringSoon}</p>
            {tier === 'agency' && portfolio.expiringSoon > 0 && (
              <BulkRenewButton listingIds={portfolio.expiringListingIds ?? []} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Per-listing insights */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Listing Insights</h2>
        <div className="space-y-4">
          {listingsWithInsights.map(({ listing, rentComp, perf }) => (
            <Card key={listing.id}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-base">
                    <Link href={`/dashboard/listings/${listing.id}`} className="hover:underline">
                      {listing.title}
                    </Link>
                  </CardTitle>
                  <span
                    className={`px-2 py-0.5 text-xs rounded ${
                      listing.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : listing.status === 'pending'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {listing.status}
                  </span>
                </div>
                <p className="text-sm text-slate-500">
                  {listing.bedrooms}BR in {listing.city} · LKR {Number(listing.rentPerMonth).toLocaleString()}/mo
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {rentComp && rentComp.similarCount > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <TrendingUp className="h-4 w-4 text-teal-600" />
                    <span>
                      Similar {listing.bedrooms}BR in {listing.city}: avg LKR {rentComp.avgRent.toLocaleString()}.
                      Yours: LKR {rentComp.yourRent.toLocaleString()}{' '}
                      <span
                        className={
                          rentComp.position === 'below'
                            ? 'text-green-600'
                            : rentComp.position === 'above'
                            ? 'text-amber-600'
                            : 'text-slate-600'
                        }
                      >
                        ({rentComp.position} market
                        {rentComp.pctBelowAbove ? ` ${Math.abs(rentComp.pctBelowAbove)}%` : ''})
                      </span>
                    </span>
                  </div>
                )}
                {perf && (
                  <div className="flex items-center gap-2 text-sm">
                    <Eye className="h-4 w-4 text-teal-600" />
                    <span>
                      {perf.totalViews} total views · {perf.viewsLast7d} in last 7 days
                      {perf.percentile !== undefined && (
                        <span className="text-slate-600">
                          {' '}
                          · Beats {perf.percentile}% of similar listings
                        </span>
                      )}
                    </span>
                  </div>
                )}
                {listing.expiresAt && listing.status === 'active' && (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Calendar className="h-4 w-4" />
                    Expires {new Date(listing.expiresAt).toLocaleDateString()}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {portfolio.listings.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-slate-600">No listings yet. Create one to see analytics.</p>
            <Link href="/dashboard/listings/new" className="mt-4 inline-block text-teal-600 font-medium hover:underline">
              Create listing
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
