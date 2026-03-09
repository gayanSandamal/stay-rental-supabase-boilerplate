import { FormConfig } from '@/components/form-builder';

export const listingFormConfig: FormConfig = {
  title: 'Create New Listing',
  description: 'Fill in the details about your property. Required fields are marked with *',
  layout: {
    type: 'custom',
    className: 'space-y-6',
  },
  fields: [
    // Basic Information Section
    {
      name: 'basicInfoSection',
      label: 'Basic Information',
      type: 'section',
      helpText: 'Start with the essential details about your property',
    },
    {
      name: 'title',
      label: 'Title',
      type: 'text',
      placeholder: 'e.g., Modern 2BR Apartment in Colombo 7',
      required: true,
      validation: {
        minLength: 10,
        maxLength: 200,
      },
    },
    {
      name: 'description',
      label: 'Description',
      type: 'textarea',
      placeholder: 'Describe your property, nearby amenities, and what makes it special...',
      rows: 5,
    },
    {
      name: 'propertyType',
      label: 'Property Type',
      type: 'select',
      options: [
        { label: 'House', value: 'house' },
        { label: 'Apartment', value: 'apartment' },
        { label: 'Room', value: 'room' },
      ],
      required: true,
    },

    // Property Details Section
    {
      name: 'propertyDetailsSection',
      label: 'Property Details',
      type: 'section',
      helpText: 'Specify the size and layout of your property',
    },
    {
      name: 'bedrooms',
      label: 'Bedrooms',
      type: 'number',
      required: true,
      min: 1,
      defaultValue: 1,
      helpText: 'For rooms, this is typically 1',
    },
    {
      name: 'bathrooms',
      label: 'Bathrooms',
      type: 'number',
      min: 0,
      helpText: 'For rooms, enter 0 if shared bathroom',
    },
    {
      name: 'areaSqft',
      label: 'Area (sq ft)',
      type: 'number',
      min: 0,
      helpText: 'Total area of the property',
      showIf: {
        field: 'propertyType',
        operator: 'in',
        value: ['house', 'apartment'],
      },
    },

    // Location Section
    {
      name: 'locationSection',
      label: 'Location',
      type: 'section',
      helpText: 'Where is your property located?',
    },
    {
      name: 'address',
      label: 'Address',
      type: 'text',
      placeholder: 'Street address',
      required: true,
    },
    {
      name: 'city',
      label: 'City',
      type: 'text',
      required: true,
      defaultValue: 'Colombo',
    },
    {
      name: 'district',
      label: 'District',
      type: 'text',
      placeholder: 'e.g., Colombo',
      helpText: 'Optional - helps with location-based searches',
    },

    // Pricing & Terms Section
    {
      name: 'pricingSection',
      label: 'Pricing & Terms',
      type: 'section',
      helpText: 'Set the rental price and terms',
    },
    {
      name: 'rentPerMonth',
      label: 'Monthly Rent (LKR)',
      type: 'number',
      required: true,
      min: 0,
      step: 0.01,
      helpText: 'Enter the monthly rental amount in LKR',
    },
    {
      name: 'depositMonths',
      label: 'Deposit (months)',
      type: 'number',
      min: 0,
      defaultValue: 3,
      helpText: 'Number of months of rent required as deposit',
    },
    {
      name: 'serviceCharge',
      label: 'Service Charge (LKR/month)',
      type: 'number',
      min: 0,
      step: 0.01,
      helpText: 'Common for apartments',
      showIf: {
        field: 'propertyType',
        operator: 'equals',
        value: 'apartment',
      },
    },
    {
      name: 'utilitiesIncluded',
      label: 'Utilities Included in Rent',
      type: 'checkbox',
      defaultValue: false,
      helpText: 'Check if water, electricity, and other utilities are included',
    },
    {
      name: 'noticePeriodDays',
      label: 'Notice Period (days)',
      type: 'number',
      min: 0,
      defaultValue: 30,
      helpText: 'Number of days notice required before moving out',
    },

    // Utilities & Infrastructure Section
    {
      name: 'utilitiesSection',
      label: 'Utilities & Infrastructure',
      type: 'section',
      helpText: 'Power, water, and internet connectivity',
    },
    {
      name: 'powerBackup',
      label: 'Power Backup',
      type: 'select',
      options: [
        { label: 'None', value: '' },
        { label: 'Generator', value: 'generator' },
        { label: 'Solar', value: 'solar' },
        { label: 'UPS', value: 'ups' },
      ],
      helpText: 'Type of backup power available',
    },
    {
      name: 'waterSource',
      label: 'Water Source',
      type: 'select',
      options: [
        { label: 'Select source', value: '' },
        { label: 'Mains', value: 'mains' },
        { label: 'Tank', value: 'tank' },
        { label: 'Borehole', value: 'borehole' },
        { label: 'Mains + Tank', value: 'mains_tank' },
        { label: 'Mains + Borehole', value: 'mains_borehole' },
      ],
      helpText: 'Primary water source for the property',
    },
    {
      name: 'waterTankSize',
      label: 'Water Tank Size (liters)',
      type: 'number',
      min: 0,
      helpText: 'Capacity of water tank if applicable',
      showIf: {
        field: 'waterSource',
        operator: 'contains',
        value: 'tank',
      },
    },
    {
      name: 'hasFiber',
      label: 'Fiber Internet Available',
      type: 'checkbox',
      defaultValue: false,
      helpText: 'Check if fiber internet connection is available',
    },
    {
      name: 'fiberISPs',
      label: 'Fiber ISPs (comma-separated)',
      type: 'text',
      placeholder: 'e.g., SLT, Dialog',
      helpText: 'List available fiber internet providers',
      showIf: {
        field: 'hasFiber',
        operator: 'isTrue',
        value: true,
      },
    },

    // Climate & Comfort Section
    {
      name: 'climateSection',
      label: 'Climate & Comfort',
      type: 'section',
      helpText: 'Cooling and ventilation features',
    },
    {
      name: 'acUnits',
      label: 'AC Units',
      type: 'number',
      min: 0,
      helpText: 'Total number of air conditioning units',
    },
    {
      name: 'fans',
      label: 'Fans',
      type: 'number',
      min: 0,
      helpText: 'Total number of ceiling or standing fans',
    },
    {
      name: 'ventilation',
      label: 'Ventilation',
      type: 'select',
      options: [
        { label: 'Select quality', value: '' },
        { label: 'Excellent', value: 'excellent' },
        { label: 'Good', value: 'good' },
        { label: 'Fair', value: 'fair' },
        { label: 'Poor', value: 'poor' },
      ],
      helpText: 'Overall air circulation and ventilation',
    },

    // Security Features Section
    {
      name: 'securitySection',
      label: 'Security Features',
      type: 'section',
      helpText: 'Safety and security measures',
    },
    {
      name: 'isGated',
      label: 'Gated Community',
      type: 'checkbox',
      defaultValue: false,
      helpText: 'Property is within a gated community or compound',
      showIf: {
        field: 'propertyType',
        operator: 'in',
        value: ['house', 'apartment'],
      },
    },
    {
      name: 'hasGuard',
      label: 'Security Guard',
      type: 'checkbox',
      defaultValue: false,
      helpText: '24/7 security guard or security service available',
      showIf: {
        field: 'propertyType',
        operator: 'in',
        value: ['house', 'apartment'],
      },
    },
    {
      name: 'hasCCTV',
      label: 'CCTV',
      type: 'checkbox',
      defaultValue: false,
      helpText: 'Closed-circuit television cameras installed',
      showIf: {
        field: 'propertyType',
        operator: 'in',
        value: ['house', 'apartment'],
      },
    },
    {
      name: 'hasBurglarBars',
      label: 'Burglar Bars',
      type: 'checkbox',
      defaultValue: false,
      helpText: 'Security bars on windows and doors',
      showIf: {
        field: 'propertyType',
        operator: 'in',
        value: ['house', 'apartment'],
      },
    },

    // Additional Features Section
    {
      name: 'featuresSection',
      label: 'Additional Features',
      type: 'section',
      helpText: 'Parking, pets, and other amenities',
    },
    {
      name: 'parking',
      label: 'Parking Available',
      type: 'checkbox',
      defaultValue: false,
      helpText: 'Check if parking space is available',
    },
    {
      name: 'parkingSpaces',
      label: 'Parking Spaces',
      type: 'number',
      min: 0,
      helpText: 'Total number of parking spaces available',
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
      helpText: 'Check if tenants are allowed to keep pets',
    },

    // Media Section
    {
      name: 'mediaSection',
      label: 'Property Photos',
      type: 'section',
      helpText: 'Visual representation helps attract more tenants',
    },
    {
      name: 'photos',
      label: 'Upload Photos',
      type: 'image-upload',
      required: false,
      maxImages: 6,
      maxSizeInMB: 5,
      helpText: 'Upload up to 6 photos of your property (optional). Images will be automatically compressed and optimized.',
      defaultValue: [],
    },

    // Contact Information Section
    {
      name: 'contactSection',
      label: 'Contact Information',
      type: 'section',
      helpText: 'How can interested tenants reach you?',
    },
    {
      name: 'contactNumbers',
      label: 'Contact Numbers',
      type: 'contact-numbers',
      required: true,
      defaultValue: [],
      helpText: 'Select at least one contact number to display on this listing. You can add new numbers if needed.',
      validation: {
        custom: (value: any) => {
          if (!Array.isArray(value) || value.length === 0) {
            return 'Please select at least one contact number';
          }
          return null;
        },
      },
    },
  ],
  submitButton: {
    label: 'Create Listing',
    loadingLabel: 'Creating...',
  },
  cancelButton: {
    label: 'Cancel',
    show: true,
  },
};

