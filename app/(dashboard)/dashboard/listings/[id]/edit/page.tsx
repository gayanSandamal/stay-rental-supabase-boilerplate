import { notFound, redirect } from 'next/navigation';
import { getListingById, getUser, getUserWithLandlord } from '@/lib/db/queries';
import { EditListingForm } from './edit-listing-form';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { db } from '@/lib/db/drizzle';
import { businessAccountMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export default async function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const user = await getUser();
  
  if (!user) {
    redirect('/sign-in');
  }

  const resolvedParams = params instanceof Promise ? await params : params;
  const listingId = Number(resolvedParams.id);

  if (isNaN(listingId) || listingId <= 0) {
    notFound();
  }

  const listing = await getListingById(listingId);

  if (!listing) {
    notFound();
  }

  // Check if user can edit this listing
  const isAdminOrOps = user.role === 'admin' || user.role === 'ops';
  let canEdit = isAdminOrOps;

  if (!canEdit) {
    // Check if user is the owner (landlord or business account member)
    const userWithLandlord = await getUserWithLandlord(user.id);
    
    if (userWithLandlord?.landlord && userWithLandlord.landlord.id === listing.landlordId) {
      canEdit = true;
    } else {
      // Check if user is a business account member who created this listing
      try {
        const member = await db.query.businessAccountMembers.findFirst({
          where: and(
            eq(businessAccountMembers.userId, user.id),
            eq(businessAccountMembers.isActive, true)
          ),
        });
        
        if (member && listing.businessAccountId === member.businessAccountId) {
          canEdit = true;
        } else if (listing.createdBy === user.id) {
          canEdit = true;
        }
      } catch (error: any) {
        // If columns don't exist, just check createdBy
        if (listing.createdBy === user.id) {
          canEdit = true;
        }
      }
    }
  }

  if (!canEdit) {
    notFound();
  }

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="mb-6">
        <Button asChild variant="outline" className="mb-4">
          <Link href="/dashboard/listings">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Listings
          </Link>
        </Button>
      </div>

      <EditListingForm listing={listing} />
    </section>
  );
}

