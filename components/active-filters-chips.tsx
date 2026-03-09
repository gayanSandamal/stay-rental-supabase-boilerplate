'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { useMemo } from 'react';

export function ActiveFiltersChips() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Get all active filters with their display values
  const activeFilters = useMemo(() => {
    const filters: Array<{ key: string; label: string; value: string }> = [];
    
    // Helper to get filter label
    const getFilterLabel = (key: string, value: string): string => {
      switch (key) {
        case 'search':
          return `Search: ${value}`;
        case 'city':
          return `City: ${value}`;
        case 'district':
          return `District: ${value}`;
        case 'propertyType':
          return value.charAt(0).toUpperCase() + value.slice(1);
        case 'bedrooms':
          return `${value} Bedroom${value !== '1' ? 's' : ''}`;
        case 'bathrooms':
          return `${value} Bathroom${value !== '1' ? 's' : ''}`;
        case 'minPrice':
          return `Min: LKR ${Number(value).toLocaleString()}`;
        case 'maxPrice':
          return `Max: LKR ${Number(value).toLocaleString()}`;
        case 'minArea':
          return `Min Area: ${value} sq ft`;
        case 'maxArea':
          return `Max Area: ${value} sq ft`;
        case 'depositMonths':
          return `Max Deposit: ${value} months`;
        case 'maxServiceCharge':
          return `Max Service: LKR ${Number(value).toLocaleString()}`;
        case 'powerBackup':
          return `Power: ${value.charAt(0).toUpperCase() + value.slice(1)}`;
        case 'waterSource':
          return `Water: ${value.charAt(0).toUpperCase() + value.slice(1)}`;
        case 'minWaterTankSize':
          return `Min Tank: ${value}L`;
        case 'fiberISP':
          return `ISP: ${value}`;
        case 'minACUnits':
          return `Min AC: ${value}+`;
        case 'minFans':
          return `Min Fans: ${value}+`;
        case 'ventilation':
          return `Ventilation: ${value.charAt(0).toUpperCase() + value.slice(1)}`;
        case 'minParkingSpaces':
          return `Parking: ${value}+ spaces`;
        case 'maxNoticePeriod':
          return `Max Notice: ${value} days`;
        case 'locationRadius':
          return `Within ${value} km`;
        case 'hasFiber':
          return 'Fiber Internet';
        case 'utilitiesIncluded':
          return 'Utilities Included';
        case 'isGated':
          return 'Gated Community';
        case 'hasGuard':
          return 'Security Guard';
        case 'hasCCTV':
          return 'CCTV';
        case 'hasBurglarBars':
          return 'Burglar Bars';
        case 'parking':
          return 'Parking';
        case 'petsAllowed':
          return 'Pets Allowed';
        case 'verifiedOnly':
          return 'Verified Only';
        case 'visitedOnly':
          return 'Visited Only';
        case 'sortBy':
          const sortLabels: Record<string, string> = {
            newest: 'Newest First',
            oldest: 'Oldest First',
            price_asc: 'Price: Low to High',
            price_desc: 'Price: High to Low',
            area_desc: 'Area: Largest',
            area_asc: 'Area: Smallest',
            bedrooms_desc: 'Bedrooms: Most',
            bedrooms_asc: 'Bedrooms: Least',
          };
          return `Sort: ${sortLabels[value] || value}`;
        default:
          return `${key}: ${value}`;
      }
    };

    // Iterate through all search params
    searchParams.forEach((value, key) => {
      if (value && value !== 'newest') { // Exclude default sort
        filters.push({
          key,
          label: getFilterLabel(key, value),
          value,
        });
      }
    });

    return filters;
  }, [searchParams]);

  const removeFilter = (key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(key);
    router.replace(`/listings?${params.toString()}`);
  };

  const clearAllFilters = () => {
    router.replace('/listings');
  };

  if (activeFilters.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6">
      <span className="text-sm text-gray-600 mr-1">Filters:</span>
      {activeFilters.map((filter) => (
        <button
          key={filter.key}
          onClick={() => removeFilter(filter.key)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-800 rounded-full text-sm font-medium hover:bg-blue-200 transition-colors"
        >
          <span>{filter.label}</span>
          <X className="h-3.5 w-3.5" />
        </button>
      ))}
      {activeFilters.length > 1 && (
        <button
          onClick={clearAllFilters}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-gray-600 hover:text-gray-900 text-sm font-medium underline"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
