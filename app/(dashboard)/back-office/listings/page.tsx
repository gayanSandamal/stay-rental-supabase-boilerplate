import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/db/drizzle';
import { listings } from '@/lib/db/schema';
import { eq, sql, and, desc } from 'drizzle-orm';
import { requireBackOfficeAccess } from '@/lib/auth/back-office';
import Link from 'next/link';
import { Eye } from 'lucide-react';

export default async function BackOfficeListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ businessAccountId?: string }> | { businessAccountId?: string };
}) {
  await requireBackOfficeAccess();

  const resolvedParams = searchParams instanceof Promise ? await searchParams : searchParams;
  const businessAccountId = resolvedParams.businessAccountId 
    ? Number(resolvedParams.businessAccountId) 
    : null;

  const conditions = [sql`${listings.businessAccountId} IS NOT NULL`];
  
  if (businessAccountId) {
    conditions.push(eq(listings.businessAccountId, businessAccountId));
  }

  const businessListings = await db
    .select()
    .from(listings)
    .where(and(...conditions))
    .orderBy(desc(listings.createdAt));

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Business Account Listings</h1>
        {businessAccountId && (
          <Button asChild variant="outline">
            <Link href="/back-office/listings">View All</Link>
          </Button>
        )}
      </div>

      {businessListings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-600">No business account listings found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {businessListings.map((listing) => (
            <Card key={listing.id}>
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {listing.title}
                    </h3>
                    <p className="text-sm text-gray-600 mb-2">{listing.address}</p>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>Status: {listing.status}</span>
                      {listing.createdBy && <span>Created by: {listing.createdBy}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/listings/${listing.id}`} target="_blank">
                        <Eye className="h-4 w-4 mr-2" />
                        View
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

