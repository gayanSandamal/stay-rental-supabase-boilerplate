import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SignedUpBanner } from '@/components/signed-up-banner';
import { getOpsDashboardStats } from '@/lib/db/queries';
import { Home, Shield } from 'lucide-react';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const stats = await getOpsDashboardStats();
  const showSignedUpBanner = searchParams?.signed_up === '1';

  return (
    <section className="flex-1 p-4 lg:p-8">
      <SignedUpBanner show={showSignedUpBanner} />
      <h1 className="text-lg lg:text-2xl font-medium mb-6">Dashboard Overview</h1>
      
      <div className="grid gap-4 md:grid-cols-2 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Listings</CardTitle>
            <Home className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeListings}</div>
            <p className="text-xs text-muted-foreground">
              {stats.verifiedListings} verified
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Verified Listings</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.verifiedListings}</div>
            <p className="text-xs text-muted-foreground">
              {stats.activeListings > 0
                ? Math.round((stats.verifiedListings / stats.activeListings) * 100)
                : 0}% of active
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Use the navigation menu to manage listings.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
