'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormBuilder, FormConfig } from '@/components/form-builder';
import { formConfigs } from '@/lib/forms';
import { Button } from '@/components/ui/button';
import { X, SlidersHorizontal } from 'lucide-react';

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FilterModal({ isOpen, onClose }: FilterModalProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get all possible filter keys
  const getAllFilterKeys = () => {
    return [
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
  };

  // Get initial values from URL params
  const getInitialValues = () => {
    const values: Record<string, any> = {};
    const keys = getAllFilterKeys();
    
    keys.forEach(key => {
      const value = searchParams.get(key);
      if (value !== null) {
        if (key === 'utilitiesIncluded' || key === 'hasFiber' || 
            key === 'isGated' || key === 'hasGuard' || key === 'hasCCTV' || 
            key === 'hasBurglarBars' || key === 'parking' || key === 'petsAllowed' ||
            key === 'verifiedOnly' || key === 'visitedOnly') {
          values[key] = value === 'true';
        } else {
          values[key] = value || '';
        }
      } else {
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
    
    // Close modal after applying
    onClose();
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
    onClose();
  };

  const hasActiveFilters = Array.from(searchParams.keys()).length > 0;

  // Custom form config
  const filterFormConfig: FormConfig = {
    ...formConfigs.filter,
    title: 'Filter Listings',
    defaultValues,
    onSubmit: (data) => {
      applyFilters(data);
    },
    submitButton: {
      label: 'Apply Filters',
      className: 'w-full bg-teal-800 hover:bg-teal-900',
    },
    cancelButton: {
      show: false,
    },
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative z-50 w-full max-w-4xl max-h-[90vh] mx-4 bg-white rounded-lg shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <SlidersHorizontal className="h-5 w-5 text-gray-600" />
            <h2 className="text-xl font-semibold text-gray-900">Filter Listings</h2>
            {hasActiveFilters && (
              <span className="text-sm bg-teal-100 text-teal-900 px-2 py-1 rounded-full">
                {Array.from(searchParams.keys()).length} active
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilters}
              >
                Clear All
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6">
          <FormBuilder config={filterFormConfig} />
        </div>

        {/* Footer */}
        <div className="border-t p-6 flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              // Trigger form submit
              const form = document.querySelector('form');
              if (form) {
                form.requestSubmit();
              }
            }}
            className="bg-teal-800 hover:bg-teal-900"
          >
            Apply Filters
          </Button>
        </div>
      </div>
    </div>
  );
}



