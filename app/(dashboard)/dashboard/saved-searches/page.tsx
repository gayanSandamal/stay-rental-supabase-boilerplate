import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { getSavedSearchesForUser } from '@/lib/db/queries';
import { isUserPremium } from '@/lib/subscription';
import { SavedSearchesClient } from './saved-searches-client';

const FREE_SAVED_SEARCH_LIMIT = 3;

export default async function SavedSearchesPage() {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  const savedSearches = await getSavedSearchesForUser(user.id);
  const isPremium = isUserPremium(user);
  const limit = isPremium ? null : FREE_SAVED_SEARCH_LIMIT;

  return (
    <section className="flex-1 p-4 lg:p-8">
      <h1 className="text-lg lg:text-2xl font-medium mb-6">Saved Search Alerts</h1>
      <SavedSearchesClient
        initialSearches={savedSearches}
        count={savedSearches.length}
        limit={limit}
        isPremium={isPremium}
      />
    </section>
  );
}
