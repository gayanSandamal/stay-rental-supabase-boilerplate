import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { getSavedSearchesForUser, getSavedSearchCount } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { savedSearches } from '@/lib/db/schema';
import { isUserPremium } from '@/lib/subscription';

const FREE_SAVED_SEARCH_LIMIT = 3;

export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searches = await getSavedSearchesForUser(user.id);
  const count = searches.length;
  const isPremium = isUserPremium(user);
  const limit = isPremium ? null : FREE_SAVED_SEARCH_LIMIT;

  return NextResponse.json({
    savedSearches: searches,
    count,
    limit,
    isPremium,
  });
}

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { name, searchParams, emailAlerts = true, whatsappAlerts = false } = body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json(
      { error: 'Name is required' },
      { status: 400 }
    );
  }

  const paramsStr =
    typeof searchParams === 'string'
      ? searchParams
      : JSON.stringify(searchParams || {});

  const isPremium = isUserPremium(user);
  if (!isPremium) {
    const count = await getSavedSearchCount(user.id);
    if (count >= FREE_SAVED_SEARCH_LIMIT) {
      return NextResponse.json(
        {
          error: `Free accounts are limited to ${FREE_SAVED_SEARCH_LIMIT} saved alerts. Upgrade to Premium for unlimited alerts.`,
          limitReached: true,
        },
        { status: 403 }
      );
    }
  }

  const [created] = await db
    .insert(savedSearches)
    .values({
      userId: user.id,
      name: name.trim().slice(0, 100),
      searchParams: paramsStr,
      emailAlerts: !!emailAlerts,
      whatsappAlerts: !!whatsappAlerts,
    })
    .returning();

  return NextResponse.json({ savedSearch: created }, { status: 201 });
}
