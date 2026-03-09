'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormBuilder, FormConfig } from '@/components/form-builder';
import { formConfigs } from '@/lib/forms';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import { useState as useReactState } from 'react';

export function ListingsFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Get all possible filter keys from URL params
  const getAllFilterKeys = () => {
    const keys = [
      'search', 'city', 'district', 'locationRadius',
      'propertyType', 'bedrooms', 'bathrooms', 'minArea', 'maxArea',
      'minPrice', 'maxPrice', 'depositMonths', 'utilitiesIncluded', 'maxServiceCharge',
      'powerBackup', 'waterSource', 'minWaterTankSize',
      'hasFiber', 'fiberISP',
      'minACUnits', 'minFans', 'ventilation',
      'isGated', 'hasGuard', 'hasCCTV', 'hasBurglarBars',
      'parking', 'minParkingSpaces', 'petsAllowed',
      'maxNoticePeriod',
      'verifiedOnly', 'visitedOnly',
      'sortBy',
    ];
    return keys;
  };

  // Get initial values from URL params
  const getInitialValues = () => {
    const values: Record<string, any> = {};
    const keys = getAllFilterKeys();
    
    keys.forEach(key => {
      const value = searchParams.get(key);
      if (value !== null) {
        // Handle boolean values
        if (key === 'utilitiesIncluded' || key === 'hasFiber' || 
            key === 'isGated' || key === 'hasGuard' || key === 'hasCCTV' || 
            key === 'hasBurglarBars' || key === 'parking' || key === 'petsAllowed' ||
            key === 'verifiedOnly' || key === 'visitedOnly') {
          values[key] = value === 'true';
        } else {
          values[key] = value || '';
        }
      } else {
        // Set defaults
        if (key === 'sortBy') {
          values[key] = 'newest';
        } else if (key.includes('Only') || key === 'hasFiber' || key === 'parking' || 
                   key === 'petsAllowed' || key === 'utilitiesIncluded' ||
                   key === 'isGated' || key === 'hasGuard' || key === 'hasCCTV' || 
                   key === 'hasBurglarBars') {
          values[key] = false;
        } else {
          values[key] = '';
        }
      }
    });
    
    return values;
  };

  const [defaultValues, setDefaultValues] = useState(getInitialValues());

  // Update default values when URL params change
  useEffect(() => {
    setDefaultValues(getInitialValues());
  }, [searchParams]);

  const applyFilters = (filters: Record<string, any>) => {
    const params = new URLSearchParams();
    const keys = getAllFilterKeys();
    
    keys.forEach(key => {
      const value = filters[key];
      if (value !== undefined && value !== null && value !== '' && value !== false) {
        if (typeof value === 'boolean') {
          if (value === true) {
            params.set(key, 'true');
          }
        } else {
          params.set(key, String(value));
        }
      }
    });

    const currentPath = window.location.pathname;
    const queryString = params.toString();
    
    router.replace(queryString ? `${currentPath}?${queryString}` : currentPath, { scroll: false });
    
    // Dispatch custom event to update listings grid
    window.dispatchEvent(new CustomEvent('updateFilters', { detail: filters }));
  };

  const clearFilters = () => {
    const clearedFilters: Record<string, any> = {};
    const keys = getAllFilterKeys();
    
    keys.forEach(key => {
      if (key === 'sortBy') {
        clearedFilters[key] = 'newest';
      } else if (key.includes('Only') || key === 'hasFiber' || key === 'parking' || 
                 key === 'petsAllowed' || key === 'utilitiesIncluded' ||
                 key === 'isGated' || key === 'hasGuard' || key === 'hasCCTV' || 
                 key === 'hasBurglarBars') {
        clearedFilters[key] = false;
      } else {
        clearedFilters[key] = '';
      }
    });
    
    setDefaultValues(clearedFilters);
    const currentPath = window.location.pathname;
    router.replace(currentPath, { scroll: false });
    
    window.dispatchEvent(new CustomEvent('updateFilters', { detail: clearedFilters }));
  };

  const hasActiveFilters = Array.from(searchParams.keys()).length > 0;

  // Get basic and advanced fields
  const basicFields = formConfigs.filter.fields?.slice(0, 10) || [];
  const advancedFields = formConfigs.filter.fields?.slice(10) || [];

  // Custom form config with our handlers
  const filterFormConfig: FormConfig = {
    ...formConfigs.filter,
    title: undefined,
    defaultValues,
    fields: showAdvanced 
      ? formConfigs.filter.fields 
      : basicFields,
    onSubmit: (data) => {
      applyFilters(data);
    },
    submitButton: {
      label: 'Apply Filters',
      className: 'w-full bg-teal-800 hover:bg-teal-900',  // Changed from orange
    },
    cancelButton: {
      show: false,
    },
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Filter Listings</CardTitle>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-8"
            >
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <FormBuilder config={filterFormConfig} />
        {advancedFields.length > 0 && (
          <Button
            variant="ghost"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full mt-4"
          >
            {showAdvanced ? (
              <>
                <ChevronUp className="h-4 w-4 mr-2" />
                Show Less Filters
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-2" />
                Show More Filters ({advancedFields.length})
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
