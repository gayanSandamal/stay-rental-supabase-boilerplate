'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ListingCard } from './listing-card';
import { Listing } from '@/lib/db/schema';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Grid, List, Map, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

type ViewMode = 'grid' | 'list' | 'map';

interface EnhancedListingsGridProps {
  initialListings: Listing[];
  showPublisher?: boolean;
}

export function EnhancedListingsGrid({ initialListings, showPublisher = true }: EnhancedListingsGridProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>(initialListings);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const observerTarget = useRef<HTMLDivElement>(null);
  const [filters, setFilters] = useState({
    search: '',
    city: '',
    minPrice: '',
    maxPrice: '',
    bedrooms: '',
    propertyType: '',
    powerBackup: '',
    waterSource: '',
    hasFiber: false,
  });

  // Update filters from URL params
  useEffect(() => {
    setFilters({
      search: searchParams.get('search') || '',
      city: searchParams.get('city') || '',
      minPrice: searchParams.get('minPrice') || '',
      maxPrice: searchParams.get('maxPrice') || '',
      bedrooms: searchParams.get('bedrooms') || '',
      propertyType: searchParams.get('propertyType') || '',
      powerBackup: searchParams.get('powerBackup') || '',
      waterSource: searchParams.get('waterSource') || '',
      hasFiber: searchParams.get('hasFiber') === 'true',
    });
  }, [searchParams]);

  // Listen for filter updates
  useEffect(() => {
    const handleFilterUpdate = (event: CustomEvent) => {
      setFilters(event.detail);
    };
    window.addEventListener('updateFilters' as any, handleFilterUpdate);
    return () => {
      window.removeEventListener('updateFilters' as any, handleFilterUpdate);
    };
  }, []);

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
      params.set('page', String(currentPage + 1));
      params.set('limit', '20');

      // Add all search params
      searchParams.forEach((value, key) => {
        params.set(key, value);
      });

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

  // Filter listings - need to include ALL filters from URL
  const filteredListings = useMemo(() => {
    return listings.filter((listing) => {
      // Search filter
      const search = searchParams.get('search');
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesSearch =
          listing.title?.toLowerCase().includes(searchLower) ||
          listing.address?.toLowerCase().includes(searchLower) ||
          listing.description?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // City filter
      const city = searchParams.get('city');
      if (city && listing.city?.toLowerCase() !== city.toLowerCase()) {
        return false;
      }

      // Price filters
      const rent = Number(listing.rentPerMonth);
      const minPrice = searchParams.get('minPrice');
      const maxPrice = searchParams.get('maxPrice');
      if (minPrice && rent < Number(minPrice)) return false;
      if (maxPrice && rent > Number(maxPrice)) return false;

      // Bedrooms filter
      const bedrooms = searchParams.get('bedrooms');
      if (bedrooms && listing.bedrooms !== Number(bedrooms)) return false;

      // Property type filter
      const propertyType = searchParams.get('propertyType');
      if (propertyType && listing.propertyType !== propertyType) return false;

      // Power backup filter
      const powerBackup = searchParams.get('powerBackup');
      if (powerBackup && listing.powerBackup !== powerBackup) return false;

      // Water source filter
      const waterSource = searchParams.get('waterSource');
      if (waterSource && listing.waterSource !== waterSource) return false;

      // Fiber filter
      const hasFiber = searchParams.get('hasFiber');
      if (hasFiber === 'true' && !listing.hasFiber) return false;

      // Add more filters as needed from searchParams
      const verifiedOnly = searchParams.get('verifiedOnly');
      if (verifiedOnly === 'true' && !listing.verified) return false;

      const visitedOnly = searchParams.get('visitedOnly');
      if (visitedOnly === 'true' && !listing.visited) return false;

      const parking = searchParams.get('parking');
      if (parking === 'true' && !listing.parking) return false;

      const petsAllowed = searchParams.get('petsAllowed');
      if (petsAllowed === 'true' && !listing.petsAllowed) return false;

      return true;
    });
  }, [listings, searchParams]);

  // Get active filter count
  const activeFilterCount = useMemo(() => {
    return Object.values(filters).filter(v => v !== '' && v !== false).length;
  }, [filters]);

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
        <div className="flex items-center gap-4">
          <p className="text-sm text-gray-600">
            Showing <span className="font-semibold text-gray-900">{filteredListings.length}</span> {filteredListings.length === 1 ? 'listing' : 'listings'}
          </p>
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
      {filteredListings.length > 0 ? (
        <>
          {viewMode === 'grid' && (
            <>
              <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-4">
                {filteredListings.map((listing) => (
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
                {!hasMore && filteredListings.length > 20 && (
                  <p className="text-gray-500 text-sm">No more listings to load</p>
                )}
              </div>
            </>
          )}
          {viewMode === 'list' && (
            <>
              <div className="space-y-4">
                {filteredListings.map((listing) => (
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
                {!hasMore && filteredListings.length > 20 && (
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
          </div>
        </Card>
      )}
    </div>
  );
}
