import { getUser } from '@/lib/db/queries';
import { redirect } from 'next/navigation';
import { ListingFormWithBuilder } from './listing-form-with-builder';
import { db } from '@/lib/db/drizzle';
import { landlords, businessAccountMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { isFeatureEnabled } from '@/lib/feature-flags';

// Flag-gated page — the quick/full toggle must reflect back-office toggles
// without a rebuild.
export const dynamic = 'force-dynamic';

interface NewListingPageProps {
  // Next 15: searchParams is a Promise and must be awaited before property access.
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function NewListingPage(props: NewListingPageProps) {
  const searchParams = await props.searchParams;
  const user = await getUser();

  if (!user) {
    redirect('/sign-in');
  }

  // The 60-second form is a mode of this page, not a separate route. With the
  // flag off, `?mode=quick` falls back to the full form and the toggle hides.
  const quickListEnabled = isFeatureEnabled('enableQuickList');
  const initialMode =
    searchParams.mode === 'quick' && quickListEnabled ? 'quick' : 'full';

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
    // The form owns its own max width: it narrows in quick mode, and the mode
    // can change client-side after this server render.
    <section className="flex-1 p-4 lg:px-8">
      {businessMember && (
        <div className="mb-4 bg-teal-50 border border-teal-200 rounded-lg p-4">
          <p className="text-sm text-teal-900">
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
        initialMode={initialMode}
        quickListEnabled={quickListEnabled}
      />
    </section>
  );
}
