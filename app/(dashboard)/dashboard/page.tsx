import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SignedUpBanner } from '@/components/signed-up-banner';
import {
  getOpsDashboardStats,
  getUser,
  getUserWithLandlord,
  getLandlordPortfolioData,
} from '@/lib/db/queries';
import { Home, Shield, Clock, FileClock } from 'lucide-react';

// Authenticated, DB-backed dashboard — never statically prerender (the stats
// query would run at build time and time out).
export const dynamic = 'force-dynamic';

export default async function DashboardPage(props: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // The page must gate itself. `app/(dashboard)/dashboard/layout.tsx` is a
  // client component with no auth check, and `middleware.ts` only proves a
  // Supabase auth user exists — `getUser()` still returns null when the
  // matching public.users row is missing or soft-deleted.
  const user = await getUser();
  if (!user) redirect('/sign-in?redirect=/dashboard');

  const isOps = user.role === 'ops' || user.role === 'admin';

  // Next 15: searchParams is a Promise and must be awaited before property access.
  const searchParams = await props.searchParams;
  const showSignedUpBanner = searchParams?.signed_up === '1';

  return (
    <section className="flex-1 p-4 lg:p-8">
      <SignedUpBanner show={showSignedUpBanner} />
      <h1 className="text-lg lg:text-2xl font-medium mb-6">Dashboard Overview</h1>

      {isOps ? <OpsStats /> : <LandlordStats userId={user.id} />}

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

/**
 * Platform-wide supply. Ops and admin only.
 *
 * This used to render for every signed-in landlord, which handed each of them
 * the exact size of the marketplace — the one number a young platform has most
 * reason not to publish to the people it is asking to supply it.
 */
async function OpsStats() {
  const stats = await getOpsDashboardStats();

  return (
    <div className="grid gap-4 md:grid-cols-2 mb-8">
      <StatCard
        title="Active Listings"
        icon={<Home className="h-4 w-4 text-muted-foreground" />}
        value={stats.activeListings}
        hint={`${stats.verifiedListings} verified`}
      />
      <StatCard
        title="Verified Listings"
        icon={<Shield className="h-4 w-4 text-muted-foreground" />}
        value={stats.verifiedListings}
        hint={`${
          stats.activeListings > 0
            ? Math.round((stats.verifiedListings / stats.activeListings) * 100)
            : 0
        }% of active`}
      />
    </div>
  );
}

/**
 * The landlord's OWN portfolio.
 *
 * Reuses `getLandlordPortfolioData`, which is already scoped by landlordId —
 * no new query needed. "Expiring in 7 days" replaces the old "verified" count
 * deliberately: it is the only one of these numbers a landlord can act on, and
 * listings expire 30 days after publish.
 */
async function LandlordStats({ userId }: { userId: number }) {
  const withLandlord = await getUserWithLandlord(userId);

  if (!withLandlord?.landlord) {
    return (
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">No listings yet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Add your first property and tenants can call or WhatsApp you directly.
          </p>
          <Link
            href="/dashboard/listings/new"
            className="inline-flex items-center rounded-full bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
          >
            List your property — free
          </Link>
        </CardContent>
      </Card>
    );
  }

  const portfolio = await getLandlordPortfolioData(withLandlord.landlord.id);

  return (
    <div className="grid gap-4 md:grid-cols-3 mb-8">
      <StatCard
        title="Active Listings"
        icon={<Home className="h-4 w-4 text-muted-foreground" />}
        value={portfolio.active}
        hint={`${portfolio.total} total`}
      />
      <StatCard
        title="Awaiting Review"
        icon={<FileClock className="h-4 w-4 text-muted-foreground" />}
        value={portfolio.pending}
        hint={portfolio.pending > 0 ? 'We check these before they go live' : 'Nothing waiting'}
      />
      <StatCard
        title="Expiring in 7 Days"
        icon={<Clock className="h-4 w-4 text-muted-foreground" />}
        value={portfolio.expiringSoon}
        hint={portfolio.expiringSoon > 0 ? 'Renew to stay in search' : 'Nothing expiring soon'}
      />
    </div>
  );
}

function StatCard({
  title,
  icon,
  value,
  hint,
}: {
  title: string;
  icon: React.ReactNode;
  value: number;
  hint: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
