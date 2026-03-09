import { getUpcomingViewings } from '@/lib/db/queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Calendar, CheckCircle2, Clock, Eye, Home } from 'lucide-react';

export default async function ViewingsPage() {
  const viewings = await getUpcomingViewings(50);

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg lg:text-2xl font-medium">Scheduled Viewings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track upcoming property viewings and quickly jump to the related lead and listing.
          </p>
        </div>
      </div>

      {viewings.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-sm text-muted-foreground mb-2">
              No upcoming viewings have been scheduled yet.
            </p>
            <p className="text-xs text-muted-foreground">
              From a lead, use <span className="font-semibold">“Schedule Viewing”</span> to create one.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {viewings.map((viewing) => {
            const scheduled = new Date(viewing.scheduledAt);
            const date = scheduled.toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            });
            const time = scheduled.toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
            });

            const landlordConfirmed = viewing.confirmedByLandlord;
            const tenantConfirmed = viewing.confirmedByTenant;

            return (
              <Card
                key={viewing.id}
                className="hover:shadow-lg transition-shadow"
              >
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
                    <div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <Calendar className="h-4 w-4" />
                        <span className="font-medium text-foreground">
                          {date} · {time}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs mt-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                          <Home className="h-3 w-3" />
                          Listing #{viewing.listingId}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                          <Eye className="h-3 w-3" />
                          Lead #{viewing.leadId}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-start md:items-end gap-2 text-xs">
                      <div className="flex flex-wrap gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${
                            landlordConfirmed
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-50 text-slate-600 border-slate-200'
                          }`}
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Landlord {landlordConfirmed ? 'confirmed' : 'pending'}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${
                            tenantConfirmed
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-50 text-slate-600 border-slate-200'
                          }`}
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Tenant {tenantConfirmed ? 'confirmed' : 'pending'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>
                          Created {new Date(viewing.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row gap-2">
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      <Link href={`/listings/${viewing.listingId}`}>
                        View Listing
                      </Link>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      <Link href={`/dashboard/leads/${viewing.leadId}`}>
                        View Lead
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}

