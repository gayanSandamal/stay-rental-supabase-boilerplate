'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Bell, Trash2, ExternalLink, BookmarkPlus } from 'lucide-react';
import useSWR from 'swr';
import type { SavedSearch } from '@/lib/db/schema';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function SavedSearchesClient({
  initialSearches,
  count,
  limit,
  isPremium,
}: {
  initialSearches: SavedSearch[];
  count: number;
  limit: number | null;
  isPremium: boolean;
}) {
  const { data, mutate: revalidate } = useSWR<{
    savedSearches: SavedSearch[];
    count: number;
    limit: number | null;
    isPremium: boolean;
  }>('/api/saved-searches', fetcher, {
    fallbackData: {
      savedSearches: initialSearches,
      count,
      limit,
      isPremium,
    },
  });

  const searches = data?.savedSearches ?? initialSearches;
  const currentCount = data?.count ?? count;
  const currentLimit = data?.limit ?? limit;

  async function handleDelete(id: number) {
    await fetch(`/api/saved-searches/${id}`, { method: 'DELETE' });
    revalidate();
  }

  function buildListingsUrl(searchParams: string): string {
    try {
      const params = JSON.parse(searchParams) as Record<string, string>;
      const sp = new URLSearchParams(params);
      return `/listings?${sp.toString()}`;
    } catch {
      return '/listings';
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          {isPremium ? (
            <>Unlimited saved alerts</>
          ) : (
            <>
              {currentCount} of {currentLimit} saved alerts
            </>
          )}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/listings" className="gap-1.5">
            <BookmarkPlus className="h-4 w-4" />
            Add from listings
          </Link>
        </Button>
      </div>

      {searches.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bell className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 mb-2">No saved search alerts yet</p>
            <p className="text-sm text-gray-500 mb-6">
              Browse listings, apply filters, and click &quot;Save this search&quot; to get alerts when new properties match.
            </p>
            <Button asChild>
              <Link href="/listings">Browse Listings</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {searches.map((search) => (
            <Card key={search.id}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 truncate">{search.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Email alerts {search.emailAlerts ? 'on' : 'off'}
                    {search.whatsappAlerts && ' · WhatsApp on'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button asChild variant="outline" size="sm">
                    <Link href={buildListingsUrl(search.searchParams)} className="gap-1">
                      <ExternalLink className="h-3.5 w-3.5" />
                      View
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleDelete(search.id)}
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!isPremium && currentCount >= (currentLimit ?? 3) && (
        <Card className="border-teal-200 bg-teal-50/50">
          <CardContent className="py-4">
            <p className="text-sm text-teal-800">
              Upgrade to <Link href="/sign-up?plan=premium" className="font-semibold underline">Premium</Link> for unlimited saved alerts.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
