'use client';

import { useState, useEffect, useMemo } from 'react';
import { ListingCard } from './listing-card';
import { Listing } from '@/lib/db/schema';
import { useSearchParams } from 'next/navigation';

interface ListingsGridProps {
  initialListings: Listing[];
}

export function ListingsGrid({ initialListings }: ListingsGridProps) {
  const searchParams = useSearchParams();
  const [listings] = useState<Listing[]>(initialListings);
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

  // Listen for filter updates from filter component
  useEffect(() => {
    const handleFilterUpdate = (event: CustomEvent) => {
      setFilters(event.detail);
    };
    window.addEventListener('updateFilters' as any, handleFilterUpdate);
    return () => {
      window.removeEventListener('updateFilters' as any, handleFilterUpdate);
    };
  }, []);

  // Filter listings client-side
  const filteredListings = useMemo(() => {
    return listings.filter((listing) => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch =
          listing.title?.toLowerCase().includes(searchLower) ||
          listing.address?.toLowerCase().includes(searchLower) ||
          listing.description?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // City filter
      if (filters.city && listing.city?.toLowerCase() !== filters.city.toLowerCase()) {
        return false;
      }

      // Price filters
      const rent = Number(listing.rentPerMonth);
      if (filters.minPrice && rent < Number(filters.minPrice)) {
        return false;
      }
      if (filters.maxPrice && rent > Number(filters.maxPrice)) {
        return false;
      }

      // Bedrooms filter
      if (filters.bedrooms && listing.bedrooms !== Number(filters.bedrooms)) {
        return false;
      }

      // Property type filter
      if (filters.propertyType && listing.propertyType !== filters.propertyType) {
        return false;
      }

      // Power backup filter
      if (filters.powerBackup && listing.powerBackup !== filters.powerBackup) {
        return false;
      }

      // Water source filter
      if (filters.waterSource && listing.waterSource !== filters.waterSource) {
        return false;
      }

      // Fiber filter
      if (filters.hasFiber && !listing.hasFiber) {
        return false;
      }

      return true;
    });
  }, [listings, filters]);

  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">
        Showing {filteredListings.length} {filteredListings.length === 1 ? 'listing' : 'listings'}
      </p>
      {filteredListings.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredListings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-lg">
          <p className="text-gray-600 mb-4">No listings found.</p>
          <p className="text-sm text-gray-500">
            Try adjusting your filters or check back later.
          </p>
        </div>
      )}
    </div>
  );
}

