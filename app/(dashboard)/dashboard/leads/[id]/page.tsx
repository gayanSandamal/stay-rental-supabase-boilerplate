import { notFound } from 'next/navigation';
import { getLeadById, getUser } from '@/lib/db/queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  Mail,
  Phone,
  Calendar,
  ArrowLeft,
  Home,
  Clock,
  User,
} from 'lucide-react';

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const user = await getUser();
  if (!user) {
    notFound();
  }

  const resolvedParams = params instanceof Promise ? await params : params;
  const leadId = Number(resolvedParams.id);

  if (isNaN(leadId) || leadId <= 0) {
    notFound();
  }

  const lead = await getLeadById(leadId);
  if (!lead) {
    notFound();
  }

  const statusColors: Record<string, string> = {
    new: 'bg-teal-100 text-teal-900',
    contacted: 'bg-yellow-100 text-yellow-800',
    view_scheduled: 'bg-purple-100 text-purple-800',
    no_show: 'bg-red-100 text-red-800',
    interested: 'bg-green-100 text-green-800',
    closed_won: 'bg-green-200 text-green-900',
    closed_lost: 'bg-red-100 text-red-800',
  };

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/leads" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Leads
          </Link>
        </Button>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <CardTitle className="text-xl flex items-center gap-2">
                <User className="h-5 w-5" />
                {lead.tenantName}
              </CardTitle>
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium w-fit ${
                  statusColors[lead.status] ?? 'bg-gray-100 text-gray-800'
                }`}
              >
                {lead.status.replace('_', ' ')}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-slate-500" />
                <div>
                  <p className="text-sm text-slate-500">Email</p>
                  <a
                    href={`mailto:${lead.tenantEmail}`}
                    className="font-medium text-teal-600 hover:underline"
                  >
                    {lead.tenantEmail}
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-slate-500" />
                <div>
                  <p className="text-sm text-slate-500">Phone</p>
                  <a
                    href={`tel:${lead.tenantPhone}`}
                    className="font-medium text-teal-600 hover:underline"
                  >
                    {lead.tenantPhone}
                  </a>
                </div>
              </div>
              {lead.preferredDate && (
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-slate-500" />
                  <div>
                    <p className="text-sm text-slate-500">Preferred date</p>
                    <p className="font-medium">
                      {new Date(lead.preferredDate).toLocaleDateString()}
                      {lead.preferredTime && ` at ${lead.preferredTime}`}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-slate-500" />
                <div>
                  <p className="text-sm text-slate-500">Created</p>
                  <p className="font-medium">
                    {new Date(lead.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {lead.notes && (
              <div>
                <p className="text-sm text-slate-500 mb-1">Notes</p>
                <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg">
                  {lead.notes}
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-4 border-t">
              <Button asChild variant="outline" size="sm">
                <Link href={`/listings/${lead.listingId}`}>
                  <Home className="h-4 w-4 mr-2" />
                  View Listing
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link href={`/dashboard/viewings/new?leadId=${lead.id}`}>
                  <Calendar className="h-4 w-4 mr-2" />
                  Schedule Viewing
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {lead.viewings && lead.viewings.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Scheduled Viewings</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {lead.viewings.map((viewing) => (
                  <li
                    key={viewing.id}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                  >
                    <span className="text-sm">
                      {new Date(viewing.scheduledAt).toLocaleString()}
                    </span>
                    <span className="text-xs text-slate-500">
                      {viewing.confirmedByLandlord && viewing.confirmedByTenant
                        ? 'Both confirmed'
                        : 'Pending confirmation'}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}
