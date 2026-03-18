import { FormConfig } from '@/components/form-builder';

export const filterFormConfig: FormConfig = {
  title: 'Filter Listings',
  layout: {
    type: 'single',
  },
  fields: [
    // ========== SEARCH & LOCATION ==========
    {
      name: 'search',
      label: 'Search',
      type: 'text',
      placeholder: 'Search by title, address, description...',
      helpText: 'Search across title, address, and description',
    },
    {
      name: 'city',
      label: 'City',
      type: 'select',
      options: [
        { label: 'Any City', value: '' },
        { label: 'Colombo', value: 'Colombo' },
        { label: 'Kandy', value: 'Kandy' },
        { label: 'Galle', value: 'Galle' },
        { label: 'Negombo', value: 'Negombo' },
        { label: 'Jaffna', value: 'Jaffna' },
        { label: 'Anuradhapura', value: 'Anuradhapura' },
        { label: 'Ratnapura', value: 'Ratnapura' },
        { label: 'Matara', value: 'Matara' },
        { label: 'Kurunegala', value: 'Kurunegala' },
        { label: 'Batticaloa', value: 'Batticaloa' },
        { label: 'Trincomalee', value: 'Trincomalee' },
        { label: 'Other', value: 'other' },
      ],
    },
    {
      name: 'district',
      label: 'District',
      type: 'text',
      placeholder: 'e.g., Colombo District, Gampaha',
    },
    {
      name: 'locationRadius',
      label: 'Search within radius',
      type: 'select',
      options: [
        { label: 'Any distance', value: '' },
        { label: 'Within 1 km', value: '1' },
        { label: 'Within 5 km', value: '5' },
        { label: 'Within 10 km', value: '10' },
        { label: 'Within 25 km', value: '25' },
      ],
      helpText: 'Requires location coordinates',
    },

    // ========== PROPERTY TYPE & SIZE ==========
    {
      name: 'propertyType',
      label: 'Property Type',
      type: 'select',
      options: [
        { label: 'Any Type', value: '' },
        { label: 'House', value: 'house' },
        { label: 'Apartment', value: 'apartment' },
        { label: 'Room', value: 'room' },
        { label: 'Villa', value: 'villa' },
        { label: 'Townhouse', value: 'townhouse' },
      ],
    },
    {
      name: 'bedrooms',
      label: 'Bedrooms',
      type: 'select',
      options: [
        { label: 'Any', value: '' },
        { label: '1', value: '1' },
        { label: '2', value: '2' },
        { label: '3', value: '3' },
        { label: '4', value: '4' },
        { label: '5+', value: '5' },
      ],
    },
    {
      name: 'bathrooms',
      label: 'Bathrooms',
      type: 'select',
      options: [
        { label: 'Any', value: '' },
        { label: '1', value: '1' },
        { label: '2', value: '2' },
        { label: '3+', value: '3' },
      ],
    },
    {
      name: 'minArea',
      label: 'Min Area (sq ft)',
      type: 'number',
      placeholder: '0',
      min: 0,
    },
    {
      name: 'maxArea',
      label: 'Max Area (sq ft)',
      type: 'number',
      placeholder: 'Any',
      min: 0,
    },

    // ========== PRICING ==========
    {
      name: 'minPrice',
      label: 'Min Rent (LKR/month)',
      type: 'number',
      placeholder: '0',
      min: 0,
      helpText: 'Minimum monthly rent',
    },
    {
      name: 'maxPrice',
      label: 'Max Rent (LKR/month)',
      type: 'number',
      placeholder: 'Any',
      min: 0,
    },
    {
      name: 'depositMonths',
      label: 'Max Deposit (months)',
      type: 'select',
      options: [
        { label: 'Any', value: '' },
        { label: '3 months or less', value: '3' },
        { label: '4 months or less', value: '4' },
        { label: '5 months or less', value: '5' },
        { label: '6 months or less', value: '6' },
      ],
      helpText: 'Maximum deposit requirement',
    },
    {
      name: 'utilitiesIncluded',
      label: 'Utilities Included',
      type: 'checkbox',
      defaultValue: false,
      helpText: 'Show only listings with utilities included in rent',
    },
    {
      name: 'maxServiceCharge',
      label: 'Max Service Charge (LKR/month)',
      type: 'number',
      placeholder: 'Any',
      min: 0,
      helpText: 'Common for apartments',
      showIf: {
        field: 'propertyType',
        operator: 'equals',
        value: 'apartment',
      },
    },

    // ========== POWER & WATER RESILIENCE ==========
    {
      name: 'powerBackup',
      label: 'Power Backup',
      type: 'select',
      helpText: 'Essential in Sri Lanka — filter by generator, solar, or UPS for properties that remain powered during outages.',
      options: [
        { label: 'Any', value: '' },
        { label: 'Generator', value: 'generator' },
        { label: 'Solar', value: 'solar' },
        { label: 'UPS', value: 'ups' },
        { label: 'Generator + Solar', value: 'generator_solar' },
        { label: 'None', value: 'none' },
      ],
    },
    {
      name: 'waterSource',
      label: 'Water Source',
      type: 'select',
      options: [
        { label: 'Any', value: '' },
        { label: 'Mains Only', value: 'mains' },
        { label: 'Tank', value: 'tank' },
        { label: 'Borehole', value: 'borehole' },
        { label: 'Mains + Tank', value: 'mains_tank' },
        { label: 'Mains + Borehole', value: 'mains_borehole' },
      ],
    },
    {
      name: 'minWaterTankSize',
      label: 'Min Water Tank Size (liters)',
      type: 'number',
      placeholder: '0',
      min: 0,
      helpText: 'Minimum water tank capacity - only relevant if water source includes tank',
      showIf: {
        field: 'waterSource',
        operator: 'contains',
        value: 'tank',
      },
    },

    // ========== INTERNET & CONNECTIVITY ==========
    {
      name: 'hasFiber',
      label: 'Fiber Internet Available',
      type: 'checkbox',
      defaultValue: false,
      helpText: 'Filter by fiber availability — important for remote work and stable connectivity.',
    },
    {
      name: 'fiberISP',
      label: 'Fiber ISP',
      type: 'select',
      options: [
        { label: 'Any ISP', value: '' },
        { label: 'SLT Fiber', value: 'slt' },
        { label: 'Dialog Fiber', value: 'dialog' },
        { label: 'Hutch Fiber', value: 'hutch' },
        { label: 'Other', value: 'other' },
      ],
      helpText: 'Specific fiber internet provider',
      showIf: {
        field: 'hasFiber',
        operator: 'isTrue',
        value: true,
      },
    },

    // ========== CLIMATE & COMFORT ==========
    {
      name: 'minACUnits',
      label: 'Min AC Units',
      type: 'select',
      options: [
        { label: 'Any', value: '' },
        { label: '1+', value: '1' },
        { label: '2+', value: '2' },
        { label: '3+', value: '3' },
        { label: '4+', value: '4' },
      ],
    },
    {
      name: 'minFans',
      label: 'Min Fans',
      type: 'select',
      options: [
        { label: 'Any', value: '' },
        { label: '1+', value: '1' },
        { label: '2+', value: '2' },
        { label: '3+', value: '3' },
        { label: '4+', value: '4' },
      ],
    },
    {
      name: 'ventilation',
      label: 'Ventilation Quality',
      type: 'select',
      options: [
        { label: 'Any', value: '' },
        { label: 'Good', value: 'good' },
        { label: 'Fair', value: 'fair' },
        { label: 'Poor', value: 'poor' },
      ],
    },

    // ========== SECURITY & SAFETY ==========
    {
      name: 'isGated',
      label: 'Gated Community',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'hasGuard',
      label: 'Security Guard',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'hasCCTV',
      label: 'CCTV Available',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'hasBurglarBars',
      label: 'Burglar Bars',
      type: 'checkbox',
      defaultValue: false,
    },

    // ========== PARKING & AMENITIES ==========
    {
      name: 'parking',
      label: 'Parking Available',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'minParkingSpaces',
      label: 'Min Parking Spaces',
      type: 'select',
      options: [
        { label: 'Any', value: '' },
        { label: '1', value: '1' },
        { label: '2', value: '2' },
        { label: '3+', value: '3' },
      ],
      helpText: 'Only relevant if parking is available',
      showIf: {
        field: 'parking',
        operator: 'isTrue',
        value: true,
      },
    },
    {
      name: 'petsAllowed',
      label: 'Pets Allowed',
      type: 'checkbox',
      defaultValue: false,
    },

    // ========== LEASE TERMS ==========
    {
      name: 'maxNoticePeriod',
      label: 'Max Notice Period (days)',
      type: 'select',
      options: [
        { label: 'Any', value: '' },
        { label: '15 days or less', value: '15' },
        { label: '30 days or less', value: '30' },
        { label: '60 days or less', value: '60' },
        { label: '90 days or less', value: '90' },
      ],
    },

    // ========== VERIFICATION STATUS ==========
    {
      name: 'verifiedOnly',
      label: 'Verified Listings Only',
      type: 'checkbox',
      defaultValue: false,
      helpText: 'Show only verified listings',
    },
    {
      name: 'visitedOnly',
      label: 'Visited Properties Only',
      type: 'checkbox',
      defaultValue: false,
      helpText: 'Show only properties visited by our team',
    },

    // ========== SORTING ==========
    {
      name: 'sortBy',
      label: 'Sort By',
      type: 'select',
      options: [
        { label: 'Newest First', value: 'newest' },
        { label: 'Oldest First', value: 'oldest' },
        { label: 'Price: Low to High', value: 'price_asc' },
        { label: 'Price: High to Low', value: 'price_desc' },
        { label: 'Area: Largest First', value: 'area_desc' },
        { label: 'Area: Smallest First', value: 'area_asc' },
        { label: 'Bedrooms: Most First', value: 'bedrooms_desc' },
        { label: 'Bedrooms: Least First', value: 'bedrooms_asc' },
      ],
      defaultValue: 'newest',
    },
  ],
  submitButton: {
    label: 'Apply Filters',
  },
};

