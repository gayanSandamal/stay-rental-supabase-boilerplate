import { redirect } from 'next/navigation';
import {
  getUser,
  getUserWithLandlord,
  getLandlordPortfolioData,
  getPortfolioInsights,
} from '@/lib/db/queries';
import { getLandlordPlanTier, isLandlordPremiumOrAbove } from '@/lib/landlord-plans';
import { MIN_MARKET_MOVE_PCT, thinMarketNote } from '@/lib/analytics/comparables';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Eye,
  Calendar,
  ArrowRight,
  Phone,
  Info,
  Search,
} from 'lucide-react';
import { BulkRenewButton } from '@/components/bulk-renew-button';
import { isFeatureEnabled } from '@/lib/feature-flags';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const userWithLandlord = await getUserWithLandlord(user.id);
  const landlord = userWithLandlord?.landlord;
  const tier = landlord ? getLandlordPlanTier(landlord) : 'free';

  /*
   * The gate used to read `tier !== 'premium' && tier !== 'agency'`. `premium`
   * is the LEGACY alias; the current tiers are free | starter | pro | agency
   * (basic→starter, premium→pro), so a landlord on `pro` — the present-day name
   * for the tier that includes analytics — was shown the upgrade card instead
   * of their own data. `isLandlordPremiumOrAbove` covers pro | premium | agency
   * and is the one place that knowledge lives.
   */
  if (!isLandlordPremiumOrAbove(landlord)) {
    const pricingEnabled = isFeatureEnabled('enablePricingSection');
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
              {pricingEnabled
                ? 'Rent comparison, listing performance, and portfolio insights are available on Pro and Agency plans.'
                : 'Rent comparison, listing performance, and portfolio insights aren’t available on your account yet.'}
            </p>
            <p className="text-slate-600 mb-4 text-sm">
              View counts for each of your listings are on your{' '}
              <Link href="/dashboard/listings" className="text-teal-600 font-medium hover:underline">
                listings page
              </Link>
              .
            </p>
            {pricingEnabled && (
              <Link
                href="/#pricing"
                className="inline-flex items-center gap-2 text-teal-600 font-medium hover:underline"
              >
                Upgrade to Pro
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
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

  /*
   * ONE call for the whole portfolio. This was a `Promise.all` over the
   * listings, each iteration running its own nested `Promise.all` — roughly 70
   * concurrent queries for a ten-listing landlord, onto a `max: 1` pool sitting
   * behind Supabase's transaction pooler. See getPortfolioInsights.
   */
  const insights = await getPortfolioInsights(portfolio.listings);

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
          {portfolio.listings.map((listing) => {
            const insight = insights.get(listing.id);
            const rentComp = insight?.rentComparison ?? null;
            return (
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
                    {listing.bedrooms}BR in {listing.city} · LKR{' '}
                    {Number(listing.rentPerMonth).toLocaleString()}/mo
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {rentComp ? (
                    <div className="flex items-center gap-2 text-sm">
                      <TrendingUp className="h-4 w-4 text-teal-600" />
                      <span>
                        Similar {listing.bedrooms}BR in {listing.city}: avg LKR{' '}
                        {rentComp.avgRent.toLocaleString()} across {rentComp.similarCount} listings.
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
                  ) : (
                    /*
                     * Below the sample-size floor we say so, rather than print a
                     * number computed over two homes or drop the row without
                     * explanation. A statistic that quietly disappears makes the
                     * ones that remain look less trustworthy, not more.
                     */
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Info className="h-4 w-4 text-slate-400" />
                      {thinMarketNote(listing.city, listing.bedrooms)}
                    </div>
                  )}

                  {/*
                    * What a live comparison can never say: where the market has
                    * MOVED. Silent until the weekly snapshots (migration 0047)
                    * have accumulated a quarter of history, and silent below
                    * MIN_MARKET_MOVE_PCT, where the "move" is sampling noise
                    * across a few dozen homes.
                    *
                    * Note the claim is about the MARKET's average, not about
                    * this landlord's rent history — nothing here records what
                    * their rent used to be, so nothing here says it changed.
                    */}
                  {insight?.marketTrend &&
                    Math.abs(insight.marketTrend.pctChange) >= MIN_MARKET_MOVE_PCT && (
                      <div className="flex items-center gap-2 text-sm">
                        {insight.marketTrend.pctChange > 0 ? (
                          <TrendingUp className="h-4 w-4 text-amber-600" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-teal-600" />
                        )}
                        <span>
                          {listing.bedrooms}BR in {listing.city}: market average{' '}
                          {insight.marketTrend.pctChange > 0 ? 'up' : 'down'}{' '}
                          {Math.abs(insight.marketTrend.pctChange)}% over the last{' '}
                          {insight.marketTrend.weeksBack} weeks (LKR{' '}
                          {insight.marketTrend.thenAvgRent.toLocaleString()} → LKR{' '}
                          {insight.marketTrend.nowAvgRent.toLocaleString()})
                          {Number(listing.rentPerMonth) < insight.marketTrend.nowAvgRent && (
                            <span className="text-slate-600">
                              {' '}
                              · yours is below the new average
                            </span>
                          )}
                        </span>
                      </div>
                    )}

                  {/*
                    * The funnel, and the reason impressions were worth building:
                    * each step's drop-off names a different problem. Low
                    * impressions is a location, price-band or filter problem;
                    * impressions without opens is a photo, title or price
                    * problem; opens without contacts is a description or trust
                    * problem. Shown only once there are impressions — a zero
                    * here means "not measured yet", not "nobody saw it".
                    */}
                  {insight && insight.impressions > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <Search className="h-4 w-4 text-teal-600" />
                      <span>
                        {insight.impressions.toLocaleString()} appearances in search →{' '}
                        {insight.totalViews.toLocaleString()} opened
                        <span className="text-slate-600">
                          {' '}
                          ({Math.round((insight.totalViews / insight.impressions) * 100)}%)
                        </span>{' '}
                        → {insight.totalContacts.toLocaleString()} contacted
                        {insight.totalViews > 0 && (
                          <span className="text-slate-600">
                            {' '}
                            ({Math.round((insight.totalContacts / insight.totalViews) * 100)}%)
                          </span>
                        )}
                      </span>
                    </div>
                  )}

                  {insight && (
                    <div className="flex items-center gap-2 text-sm">
                      <Eye className="h-4 w-4 text-teal-600" />
                      <span>
                        {insight.totalViews} total views · {insight.viewsLast7d} in last 7 days
                        {/*
                          * Views and people are reported side by side, never
                          * swapped: "120 views from 34 people" is both more
                          * useful and more honest than either number alone.
                          * Null means the window predates view deduplication,
                          * so we show nothing rather than a low number that
                          * would read as a traffic collapse.
                          */}
                        {insight.uniqueViewersLast7d !== null && (
                          <span className="text-slate-600">
                            {' '}
                            from {insight.uniqueViewersLast7d}{' '}
                            {insight.uniqueViewersLast7d === 1 ? 'person' : 'people'}
                          </span>
                        )}
                        {insight.percentile !== null && (
                          <span className="text-slate-600">
                            {' '}
                            · Beats {insight.percentile}% of similar listings
                          </span>
                        )}
                      </span>
                    </div>
                  )}

                  {insight && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-teal-600" />
                      <span>
                        {insight.totalContacts}{' '}
                        {insight.totalContacts === 1 ? 'contact tap' : 'contact taps'}
                        {insight.totalContacts > 0 && (
                          <span className="text-slate-600">
                            {' '}
                            ({insight.callClicks} call · {insight.whatsappClicks} WhatsApp)
                          </span>
                        )}
                        <span className="text-slate-600">
                          {' '}
                          · {insight.contactsLast7d} in last 7 days
                        </span>
                        {insight.totalViews > 0 && insight.totalContacts > 0 && (
                          <span className="text-slate-600">
                            {' '}
                            ·{' '}
                            {Math.round((insight.totalContacts / insight.totalViews) * 100)}% of
                            views
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
            );
          })}
        </div>
      </div>

      {portfolio.listings.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-slate-600">No listings yet. Create one to see analytics.</p>
            <Link
              href="/dashboard/listings/new"
              className="mt-4 inline-block text-teal-600 font-medium hover:underline"
            >
              Create listing
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
