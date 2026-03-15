import { getUser, getAnalyticsDashboardData, getRecentAuditLogs } from '@/lib/db/queries';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Users,
  Home,
  AlertTriangle,
  Download,
  Shield,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const user = await getUser();

  if (!user) redirect('/sign-in');
  if (user.role !== 'admin' && user.role !== 'ops') redirect('/dashboard');

  const data = await getAnalyticsDashboardData();
  const recentLogs = await getRecentAuditLogs(15);

  const verificationRate =
    data.activeListingsCount > 0
      ? ((data.verifiedListingsCount / data.activeListingsCount) * 100).toFixed(1)
      : '0';

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-lg lg:text-2xl font-medium">
          Analytics & Reporting
        </h1>
        <Button variant="outline" size="sm" asChild>
          <a href="/api/export/listings" download>
            <Download className="h-4 w-4 mr-1" />
            Export Listings
          </a>
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Active Listings
            </CardTitle>
            <Home className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.activeListingsCount}
            </div>
            <p className="text-xs text-muted-foreground">
              +{data.monthlyListingsCount} this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Users
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalUsersCount}</div>
            <p className="text-xs text-muted-foreground">
              {verificationRate}% listings verified
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Expiring Soon
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.expiringListingsCount}</div>
            <p className="text-xs text-muted-foreground">
              Listings in next 7 days
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        {/* Listing Status Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Listings by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { label: 'Active', key: 'active', color: 'bg-green-500', textColor: 'text-green-800' },
                { label: 'Pending', key: 'pending', color: 'bg-yellow-500', textColor: 'text-yellow-800' },
                { label: 'Rented', key: 'rented', color: 'bg-teal-600', textColor: 'text-teal-900' },
                { label: 'Expired', key: 'expired', color: 'bg-orange-500', textColor: 'text-orange-800' },
                { label: 'Rejected', key: 'rejected', color: 'bg-red-500', textColor: 'text-red-800' },
                { label: 'Archived', key: 'archived', color: 'bg-gray-500', textColor: 'text-gray-800' },
              ].map((s) => {
                const count = data.listingsByStatus[s.key] ?? 0;
                return (
                  <div
                    key={s.key}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${s.color}`} />
                      <span className="text-sm text-gray-600">{s.label}</span>
                    </div>
                    <span className={`text-sm font-semibold ${s.textColor}`}>
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>

            {data.expiringListingsCount > 0 && (
              <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <span className="text-sm text-orange-800">
                  {data.expiringListingsCount} listing
                  {data.expiringListingsCount > 1 ? 's' : ''} expiring within 7
                  days
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Cities */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Supply by City</CardTitle>
          </CardHeader>
          <CardContent>
            {data.topCities.length > 0 ? (
              <div className="space-y-2">
                {data.topCities.map((city) => (
                  <div
                    key={city.city}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm text-gray-600">{city.city}</span>
                    <span className="text-sm font-medium">
                      {city.count} listing{city.count > 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No active listings yet</p>
            )}
          </CardContent>
        </Card>

        {/* Average Rent by City */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Average Rent by City</CardTitle>
          </CardHeader>
          <CardContent>
            {data.avgRentByCity.length > 0 ? (
              <div className="space-y-2">
                {data.avgRentByCity.map((city) => (
                  <div
                    key={city.city}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm text-gray-600">{city.city}</span>
                    <span className="text-sm font-medium">
                      LKR {city.avgRent.toLocaleString()}/mo
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No active listings yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity Log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentLogs.length > 0 ? (
            <div className="space-y-2">
              {recentLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0"
                >
                  <div>
                    <span className="font-medium text-gray-800">
                      {log.action.replace(/_/g, ' ')}
                    </span>
                    <span className="text-gray-500 ml-2">
                      {log.entityType}
                      {log.entityId ? ` #${log.entityId}` : ''}
                    </span>
                  </div>
                  <div className="text-right text-xs text-gray-400">
                    <div>{log.userName || log.userEmail || 'System'}</div>
                    <div>
                      {new Date(log.createdAt).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No activity recorded yet</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
