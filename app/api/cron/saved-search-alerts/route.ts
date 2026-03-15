import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { savedSearches, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getActiveListings } from '@/lib/db/queries';
import { sendSavedSearchAlert } from '@/lib/email';
import { createNotification } from '@/lib/notifications';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://stayrental.lk';

/**
 * Vercel Cron: sends saved search alerts when new listings match.
 * Runs every 6 hours. Secured by CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
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
      })
      .from(savedSearches)
      .innerJoin(users, eq(savedSearches.userId, users.id))
      .where(eq(savedSearches.emailAlerts, true));

    let totalAlerts = 0;

    for (const search of searchesWithAlerts) {
      const since = search.lastAlertAt
        ? search.lastAlertAt
        : new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h ago if first run

      let filters: Record<string, unknown> = {
        limit: 20,
        createdAtSince: since,
      };

      try {
        const params = JSON.parse(search.searchParams) as Record<string, string>;
        if (params.search) filters.search = params.search;
        if (params.city) filters.city = params.city;
        if (params.district) filters.district = params.district;
        if (params.minPrice) filters.minPrice = parseInt(params.minPrice);
        if (params.maxPrice) filters.maxPrice = parseInt(params.maxPrice);
        if (params.bedrooms) filters.bedrooms = parseInt(params.bedrooms);
        if (params.propertyType) filters.propertyType = params.propertyType;
        if (params.powerBackup) filters.powerBackup = params.powerBackup;
        if (params.waterSource) filters.waterSource = params.waterSource;
        if (params.hasFiber === 'true') filters.hasFiber = true;
        if (params.verifiedOnly === 'true') filters.verifiedOnly = true;
        if (params.visitedOnly === 'true') filters.visitedOnly = true;
        if (params.parking === 'true') filters.parking = true;
        if (params.petsAllowed === 'true') filters.petsAllowed = true;
      } catch {
        // Invalid JSON - skip
        continue;
      }

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
