'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { ListingCard } from './listing-card';
import { Listing } from '@/lib/db/schema';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Grid, List, Map, Loader2, ArrowRight } from 'lucide-react';
import { SaveSearchButton } from '@/components/save-search-button';
import { useRouter } from 'next/navigation';
import { useFeatureFlag } from '@/lib/hooks/use-feature-flags';
import { WhatsAppConciergeButton } from '@/components/whatsapp-concierge-button';

type ViewMode = 'grid' | 'list' | 'map';

interface EnhancedListingsGridProps {
  initialListings: Listing[];
  showPublisher?: boolean;
}

export function EnhancedListingsGrid({ initialListings, showPublisher = true }: EnhancedListingsGridProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const quickListEnabled = useFeatureFlag('enableQuickList');
  const conciergeEnabled = useFeatureFlag('enableWhatsAppConcierge');
  const [listings, setListings] = useState<Listing[]>(initialListings);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const observerTarget = useRef<HTMLDivElement>(null);
  // Reset listings when filters change
  useEffect(() => {
    setListings(initialListings);
    setCurrentPage(1);
    setHasMore(true);
  }, [initialListings]);

  // Fetch more listings
  const loadMoreListings = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    try {
      const params = new URLSearchParams();
      // URL filters first, pagination second. The other order let a URL that
      // carried its own ?page= overwrite the cursor, so infinite scroll kept
      // refetching the same page.
      searchParams.forEach((value, key) => {
        params.set(key, value);
      });
      params.set('page', String(currentPage + 1));
      params.set('limit', '20');

      const response = await fetch(`/api/listings/paginated?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        setListings((prev) => [...prev, ...data.listings]);
        setHasMore(data.hasMore);
        setCurrentPage(data.page);
      }
    } catch (error) {
      console.error('Error loading more listings:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [currentPage, hasMore, isLoadingMore, searchParams]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          loadMoreListings();
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMore, isLoadingMore, loadMoreListings]);

  /*
   * NO CLIENT-SIDE RE-FILTER. There used to be one here, and it could only ever
   * do harm:
   *
   *  - It cannot add correctness. The server already applied these filters; the
   *    client can only REMOVE rows the server said matched.
   *  - Its semantics differed from the server's, so it removed real matches.
   *    `search` is Postgres full-text with prefix matching server-side and was a
   *    naive `String.includes` here; `city` is an exact `eq` server-side and was
   *    `.toLowerCase()` here.
   *  - It broke counts and pagination. Rows were hidden AFTER the server had
   *    computed `offset` and `hasMore`, so "Showing N" disagreed with the server
   *    and hiding enough of a 20-row page could leave the infinite-scroll
   *    sentinel above the fold forever.
   *
   * It also only implemented 13 of the 33 filters, which is the same drift that
   * `lib/listings/filter-params.ts` now exists to prevent.
   */

  // Remove filter
  const removeFilter = (key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(key);
    router.replace(`/listings?${params.toString()}`);
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <p className="text-sm text-gray-600">
            Showing <span className="font-semibold text-gray-900">{listings.length}</span> {listings.length === 1 ? 'listing' : 'listings'}
          </p>
          <SaveSearchButton />
        </div>

        {/* View Toggle */}
        <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden bg-white">
          <Button
            variant={viewMode === 'grid' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('grid')}
            className="rounded-none border-0 h-9"
          >
            <Grid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('list')}
            className="rounded-none border-0 h-9"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'map' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('map')}
            className="rounded-none border-0 h-9"
            disabled
          >
            <Map className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Listings Display */}
      {listings.length > 0 ? (
        <>
          {viewMode === 'grid' && (
            <>
              <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-4">
                {listings.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} showPublisher={showPublisher} />
                ))}
              </div>
              {/* Infinite scroll trigger */}
              <div ref={observerTarget} className="h-20 flex items-center justify-center">
                {isLoadingMore && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Loading more listings...</span>
                  </div>
                )}
                {!hasMore && listings.length > 20 && (
                  <p className="text-gray-500 text-sm">No more listings to load</p>
                )}
              </div>
            </>
          )}
          {viewMode === 'list' && (
            <>
              <div className="space-y-4">
                {listings.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} viewMode="list" showPublisher={showPublisher} />
                ))}
              </div>
              {/* Infinite scroll trigger */}
              <div ref={observerTarget} className="h-20 flex items-center justify-center">
                {isLoadingMore && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Loading more listings...</span>
                  </div>
                )}
                {!hasMore && listings.length > 20 && (
                  <p className="text-gray-500 text-sm">No more listings to load</p>
                )}
              </div>
            </>
          )}
          {viewMode === 'map' && (
            <Card className="p-12 text-center">
              <Map className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <p className="text-lg font-semibold text-gray-900 mb-2">Map View Coming Soon</p>
              <p className="text-gray-600">We're working on an interactive map to help you explore properties by location.</p>
            </Card>
          )}
        </>
      ) : (
        <Card className="p-12 text-center">
          <div className="max-w-md mx-auto">
            <p className="text-lg font-semibold text-gray-900 mb-2">
              {searchParams.get('search') ? (
                <>
                  No listings found for &quot;
                  <button
                    type="button"
                    onClick={() => router.push('/listings')}
                    className="font-semibold text-teal-600 hover:text-teal-700 hover:underline focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 rounded"
                  >
                    {searchParams.get('search')}
                  </button>
                  &quot;
                </>
              ) : (
                'No listings found'
              )}
            </p>
            <p className="text-gray-600 mb-6">
              {searchParams.get('search')
                ? 'Try a different search term or click the keyword above to browse all listings.'
                : 'Try adjusting your filters to find more properties.'}
            </p>
            <Button
              variant="outline"
              onClick={() => router.push('/listings')}
            >
              Clear All Filters
            </Button>

            {/* Landlord recruitment — an empty result is a supply opportunity */}
            <div className="mt-8 pt-6 border-t border-slate-200 text-left sm:text-center">
              <p className="text-sm font-semibold text-slate-900 mb-1">
                Own a property in {searchParams.get('city') || 'Sri Lanka'}?
              </p>
              <p className="text-sm text-slate-600 mb-4">
                Be the first to list it here — free, verified, and tenants contact
                you directly.
              </p>
              <div className="flex flex-wrap gap-3 sm:justify-center">
                {quickListEnabled ? (
                  <Link
                    href="/dashboard/listings/new?mode=quick"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold transition-colors"
                  >
                    List it in 60 seconds
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                ) : (
                  <Link
                    href="/list-your-property"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold transition-colors"
                  >
                    List your property free
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
                {conciergeEnabled && (
                  <WhatsAppConciergeButton
                    variant="compact"
                    source="from empty listings results"
                    label="WhatsApp us — we list it for you"
                  />
                )}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
