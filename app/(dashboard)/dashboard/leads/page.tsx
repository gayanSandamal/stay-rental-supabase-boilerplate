import { getLeadsForOps } from '@/lib/db/queries';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mail, Phone, Calendar, User } from 'lucide-react';

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const filters = {
    status: searchParams.status as
      | 'new'
      | 'contacted'
      | 'view_scheduled'
      | 'no_show'
      | 'interested'
      | 'closed_won'
      | 'closed_lost'
      | undefined,
    assignedTo: searchParams.assignedTo
      ? Number(searchParams.assignedTo)
      : undefined,
    limit: 50,
    offset: searchParams.page ? (Number(searchParams.page) - 1) * 50 : 0,
  };

  const leads = await getLeadsForOps(filters);

  return (
    <section className="flex-1 p-4 lg:p-8">
      <h1 className="text-lg lg:text-2xl font-medium mb-6">Leads Management</h1>

      <div className="space-y-4">
        {leads.map((lead) => (
          <Card key={lead.id} className="hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {lead.tenantName}
                  </h3>
                  <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                    <div className="flex items-center">
                      <Mail className="h-4 w-4 mr-1" />
                      {lead.tenantEmail}
                    </div>
                    <div className="flex items-center">
                      <Phone className="h-4 w-4 mr-1" />
                      {lead.tenantPhone}
                    </div>
                  </div>
                </div>
                <span
                  className={`px-3 py-1 rounded text-xs font-medium ${
                    lead.status === 'new'
                      ? 'bg-blue-100 text-blue-800'
                      : lead.status === 'contacted'
                      ? 'bg-yellow-100 text-yellow-800'
                      : lead.status === 'view_scheduled'
                      ? 'bg-purple-100 text-purple-800'
                      : lead.status === 'interested'
                      ? 'bg-green-100 text-green-800'
                      : lead.status === 'closed_won'
                      ? 'bg-green-200 text-green-900'
                      : lead.status === 'closed_lost'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {lead.status.replace('_', ' ')}
                </span>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-700">
                  <strong>Listing:</strong>{' '}
                  <Link
                    href={`/listings/${lead.listingId}`}
                    className="text-orange-600 hover:underline"
                  >
                    View Listing #{lead.listingId}
                  </Link>
                </p>
                {lead.preferredDate && (
                  <div className="flex items-center text-sm text-gray-600 mt-2">
                    <Calendar className="h-4 w-4 mr-1" />
                    Preferred: {new Date(lead.preferredDate).toLocaleDateString()}
                    {lead.preferredTime && ` at ${lead.preferredTime}`}
                  </div>
                )}
                {lead.notes && (
                  <p className="text-sm text-gray-600 mt-2">
                    <strong>Notes:</strong> {lead.notes}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  <Link href={`/dashboard/leads/${lead.id}`}>View Details</Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  <Link href={`/dashboard/viewings/new?leadId=${lead.id}`}>
                    Schedule Viewing
                  </Link>
                </Button>
              </div>

              <div className="mt-4 pt-4 border-t text-xs text-gray-500">
                Created: {new Date(lead.createdAt).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {leads.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-gray-600">No leads found.</p>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

