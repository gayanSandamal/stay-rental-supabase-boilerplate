import { getUser } from '@/lib/db/queries';
import { redirect } from 'next/navigation';
import { ListingFormWithBuilder } from './listing-form-with-builder';
import { db } from '@/lib/db/drizzle';
import { landlords, businessAccountMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export default async function NewListingPage() {
  const user = await getUser();

  if (!user) {
    redirect('/sign-in');
  }

  // Check if user is a business account member
  const businessMember = await db.query.businessAccountMembers.findFirst({
    where: and(
      eq(businessAccountMembers.userId, user.id),
      eq(businessAccountMembers.isActive, true)
    ),
    with: {
      businessAccount: true,
    },
  });

  // Ensure user has a landlord record
  let landlord = await db.query.landlords.findFirst({
    where: eq(landlords.userId, user.id),
  });

  if (!landlord) {
    // Create landlord record for the user
    const [newLandlord] = await db
      .insert(landlords)
      .values({
        userId: user.id,
      })
      .returning();
    landlord = newLandlord;
  }

  return (
    <section className="flex-1 p-4 lg:px-8">
      {businessMember && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>Business Account:</strong> {businessMember.businessAccount.name}
            <br />
            This listing will be tracked under your business account.
          </p>
        </div>
      )}
      <ListingFormWithBuilder 
        landlordId={landlord.id}
        businessAccountId={businessMember?.businessAccountId}
        createdBy={user.id}
      />
    </section>
  );
}

