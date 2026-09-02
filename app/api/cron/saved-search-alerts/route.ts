import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { savedSearches, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getActiveListings } from '@/lib/db/queries';
import { sendSavedSearchAlert } from '@/lib/email';
import { createNotification } from '@/lib/notifications';
import { newListingHideHours } from '@/lib/subscription';
import { parseListingFilters } from '@/lib/listings/filter-params';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://easyrent.lk';

/**
 * Vercel Cron: sends saved search alerts when new listings match.
 * Runs every 6 hours. Secured by CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // Fail closed: a missing CRON_SECRET must NOT make this endpoint public
  // (it sends emails and writes to the DB).
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const searchesWithAlerts = await db
      .select({
        id: savedSearches.id,
        userId: savedSearches.userId,
        name: savedSearches.name,
        searchParams: savedSearches.searchParams,
        lastAlertAt: savedSearches.lastAlertAt,
        userEmail: users.email,
        userName: users.name,
        subscriptionTier: users.subscriptionTier,
        subscriptionExpiresAt: users.subscriptionExpiresAt,
      })
      .from(savedSearches)
      .innerJoin(users, eq(savedSearches.userId, users.id))
      .where(eq(savedSearches.emailAlerts, true));

    let totalAlerts = 0;

    for (const search of searchesWithAlerts) {
      const since = search.lastAlertAt
        ? search.lastAlertAt
        : new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h ago if first run

      let filters: Record<string, unknown>;
      try {
        const params = JSON.parse(search.searchParams) as Record<string, string>;
        // The same parser the listings page and the paginated API use, so an
        // alert can no longer match on a different set of filters than the
        // website showed when the renter saved the search. It previously
        // honoured 14 of the 33, silently.
        filters = {
          ...parseListingFilters(params),
          limit: 20,
          publishedSince: since,
          // Oldest-published first so a truncated window is consumed in order.
          sortBy: 'published_asc',
        };
      } catch {
        // Invalid JSON - skip
        continue;
      }

      // Early access: free users only get alerted about listings they can see
      // (>= 24h old). No delay for anyone while paid visibility is off.
      filters.hideNewListingsHours = newListingHideHours({
        subscriptionTier: search.subscriptionTier,
        subscriptionExpiresAt: search.subscriptionExpiresAt,
      });

      const listings = await getActiveListings(filters as any);

      if (listings.length > 0) {
        const params = JSON.parse(search.searchParams) as Record<string, unknown>;
        const stringParams: Record<string, string> = {};
        for (const [k, v] of Object.entries(params)) {
          if (v != null && v !== '') stringParams[k] = String(v);
        }
        const listingsUrl = `${baseUrl}/listings?${new URLSearchParams(stringParams).toString()}`;

        await sendSavedSearchAlert(
          search.userEmail,
          search.userName ?? undefined,
          search.name,
          listings.map((l) => ({ id: l.id, title: l.title })),
          listingsUrl
        );

        await createNotification({
          userId: search.userId,
          type: 'saved_search_alert',
          title: `${listings.length} new listing${listings.length === 1 ? '' : 's'} match "${search.name}"`,
          body: listings.slice(0, 2).map((l) => l.title).join(', '),
          link: listingsUrl,
        });

        await db
          .update(savedSearches)
          .set({ lastAlertAt: new Date(), updatedAt: new Date() })
          .where(eq(savedSearches.id, search.id));

        totalAlerts++;
      }
    }

    return NextResponse.json({
      ok: true,
      searchesChecked: searchesWithAlerts.length,
      alertsSent: totalAlerts,
    });
  } catch (error: unknown) {
    console.error('[cron/saved-search-alerts]', error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
