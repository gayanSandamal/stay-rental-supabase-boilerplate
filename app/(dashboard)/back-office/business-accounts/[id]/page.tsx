import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, Users, List, Mail, Phone, MapPin } from 'lucide-react';
import { db } from '@/lib/db/drizzle';
import { businessAccounts, listings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireBackOfficeAccess } from '@/lib/auth/back-office';
import Link from 'next/link';
import { RemoveMemberButton } from './remove-member-button';

export default async function BusinessAccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  await requireBackOfficeAccess();

  const resolvedParams = params instanceof Promise ? await params : params;
  const accountId = Number(resolvedParams.id);

  if (isNaN(accountId) || accountId <= 0) {
    notFound();
  }

  const account = await db.query.businessAccounts.findFirst({
    where: eq(businessAccounts.id, accountId),
    with: {
      members: {
        with: {
          user: true,
        },
      },
    },
  });

  if (!account) {
    notFound();
  }

  const accountListings = await db
    .select()
    .from(listings)
    .where(eq(listings.businessAccountId, accountId))
    .limit(10);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{account.name}</h1>
        <Button asChild variant="outline">
          <Link href="/back-office/business-accounts">Back to List</Link>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Account Details */}
        <Card>
          <CardHeader>
            <CardTitle>Account Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center">
              <Building2 className="h-5 w-5 text-gray-400 mr-3" />
              <div>
                <p className="text-sm text-gray-500">Business Name</p>
                <p className="font-medium">{account.name}</p>
              </div>
            </div>
            <div className="flex items-center">
              <Mail className="h-5 w-5 text-gray-400 mr-3" />
              <div>
                <p className="text-sm text-gray-500">Email</p>
                <p className="font-medium">{account.email}</p>
              </div>
            </div>
            {account.phone && (
              <div className="flex items-center">
                <Phone className="h-5 w-5 text-gray-400 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">Phone</p>
                  <p className="font-medium">{account.phone}</p>
                </div>
              </div>
            )}
            {account.address && (
              <div className="flex items-center">
                <MapPin className="h-5 w-5 text-gray-400 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">Address</p>
                  <p className="font-medium">{account.address}</p>
                </div>
              </div>
            )}
            <div>
              <p className="text-sm text-gray-500">Status</p>
              <span className={`inline-block px-2 py-1 text-xs rounded-full font-medium ${
                account.status === 'active' 
                  ? 'bg-green-100 text-green-800' 
                  : account.status === 'suspended'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {account.status}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Team Members */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Team Members</CardTitle>
              <Button asChild size="sm" variant="outline">
                <Link href={`/back-office/business-accounts/${accountId}/add-member`}>
                  <Users className="h-4 w-4 mr-2" />
                  Add Member
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {account.members.length === 0 ? (
              <p className="text-sm text-gray-500">No team members yet.</p>
            ) : (
              <div className="space-y-2">
                {account.members.map((member) => (
                  <div key={member.id} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <div className="flex-1">
                      <p className="font-medium">{member.user.name || member.user.email}</p>
                      <p className="text-xs text-gray-500">{member.role}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 text-xs rounded ${
                        member.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {member.isActive ? 'Active' : 'Inactive'}
                      </span>
                      <RemoveMemberButton
                        businessAccountId={accountId}
                        memberId={member.id}
                        memberName={member.user.name || member.user.email}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Listings */}
      <Card className="mt-6">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Recent Listings</CardTitle>
            <Button asChild variant="outline" size="sm">
              <Link href={`/back-office/listings?businessAccountId=${accountId}`}>
                View All
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {accountListings.length === 0 ? (
            <p className="text-sm text-gray-500">No listings yet.</p>
          ) : (
            <div className="space-y-2">
              {accountListings.map((listing) => (
                <Link
                  key={listing.id}
                  href={`/back-office/listings/${listing.id}`}
                  className="block p-3 bg-gray-50 rounded hover:bg-gray-100 transition-colors"
                >
                  <p className="font-medium">{listing.title}</p>
                  <p className="text-sm text-gray-500">{listing.address}</p>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
