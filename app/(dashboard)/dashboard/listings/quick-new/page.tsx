import { getUser } from '@/lib/db/queries';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { landlords } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { QuickListForm } from './quick-list-form';

// Flag-gated page — must reflect back-office toggles without a rebuild.
export const dynamic = 'force-dynamic';

export default async function QuickNewListingPage() {
  const user = await getUser();

  if (!user) {
    // Preserve the funnel: sign-up/sign-in bounce back here afterwards.
    redirect('/sign-in?redirect=/dashboard/listings/quick-new');
  }

  if (!isFeatureEnabled('enableQuickList')) {
    redirect('/dashboard/listings/new');
  }

  // Ensure user has a landlord record (same self-service pattern as the full form)
  let landlord = await db.query.landlords.findFirst({
    where: eq(landlords.userId, user.id),
  });

  if (!landlord) {
    const [newLandlord] = await db
      .insert(landlords)
      .values({ userId: user.id })
      .returning();
    landlord = newLandlord;
  }

  return (
    <section className="flex-1 p-4 lg:px-8 max-w-2xl mx-auto w-full">
      <QuickListForm landlordId={landlord.id} />
    </section>
  );
}
