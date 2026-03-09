import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Users, List } from 'lucide-react';
import { db } from '@/lib/db/drizzle';
import { businessAccounts, businessAccountMembers, listings } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { requireBackOfficeAccess } from '@/lib/auth/back-office';

export default async function BackOfficePage() {
  await requireBackOfficeAccess();

  // Safely get statistics - handle missing tables
  let totalBusinessAccounts = { count: 0 };
  let totalTeamMembers = { count: 0 };
  let totalListings = { count: 0 };

  try {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(businessAccounts);
    totalBusinessAccounts = result || { count: 0 };
  } catch (error: any) {
    if (error.message?.includes('does not exist')) {
      console.warn('business_accounts table does not exist yet. Please run migrations.');
    } else {
      throw error;
    }
  }

  try {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(businessAccountMembers)
      .where(eq(businessAccountMembers.isActive, true));
    totalTeamMembers = result || { count: 0 };
  } catch (error: any) {
    if (error.message?.includes('does not exist')) {
      console.warn('business_account_members table does not exist yet. Please run migrations.');
    } else {
      throw error;
    }
  }

  try {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(listings)
      .where(sql`${listings.businessAccountId} IS NOT NULL`);
    totalListings = result || { count: 0 };
  } catch (error: any) {
    if (error.message?.includes('does not exist') || error.message?.includes('column')) {
      console.warn('business_account_id column does not exist yet. Please run migrations.');
    } else {
      throw error;
    }
  }

  const stats = [
    {
      title: 'Business Accounts',
      value: totalBusinessAccounts.count,
      icon: Building2,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      title: 'Active Team Members',
      value: totalTeamMembers.count,
      icon: Users,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      title: 'Business Listings',
      value: totalListings.count,
      icon: List,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
    },
  ];

  return (
    <section className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto w-full">
      <h1 className="text-lg lg:text-2xl font-medium mb-6">Back Office Overview</h1>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <div className={`${stat.bgColor} p-2 rounded-lg`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Use the navigation menu to manage business accounts, team members, and listings.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
