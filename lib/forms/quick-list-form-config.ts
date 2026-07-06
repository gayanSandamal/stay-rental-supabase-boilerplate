import { FormConfig } from '@/components/form-builder';

/**
 * The 60-second quick-list form (gated by `enableQuickList`).
 *
 * Exactly the API's required minimum — title, city, address, bedrooms, rent,
 * contact number. Submissions create a normal `pending` listing via
 * POST /api/listings; ops collects photos and the remaining details during
 * the verification call, so nothing here is a second data model.
 */
export const quickListFormConfig: FormConfig = {
  title: 'List your property in 60 seconds',
  description:
    "Six quick fields — that's it. Our team calls or WhatsApps you to confirm details and photos before it goes live.",
  layout: {
    type: 'custom',
    className: 'space-y-6',
  },
  fields: [
    {
      name: 'title',
      label: 'Title',
      type: 'text',
      placeholder: 'e.g., 2BR House in Nugegoda',
      required: true,
      validation: {
        minLength: 10,
        maxLength: 200,
      },
    },
    {
      name: 'city',
      label: 'City',
      type: 'text',
      required: true,
      defaultValue: 'Colombo',
    },
    {
      name: 'address',
      label: 'Address',
      type: 'text',
      placeholder: 'Street address (shown as area only until you approve)',
      required: true,
    },
    {
      name: 'bedrooms',
      label: 'Bedrooms',
      type: 'number',
      required: true,
      defaultValue: 1,
      validation: {
        custom: (value: any) => {
          const n = Number(value);
          if (!n || n < 1) return 'At least 1 bedroom';
          return null;
        },
      },
    },
    {
      name: 'rentPerMonth',
      label: 'Monthly Rent (LKR)',
      type: 'number',
      placeholder: 'e.g., 85000',
      required: true,
      validation: {
        custom: (value: any) => {
          const n = Number(value);
          if (!n || n <= 0) return 'Enter the monthly rent in LKR';
          return null;
        },
      },
    },
    {
      name: 'contactNumbers',
      label: 'Contact Number',
      type: 'contact-numbers',
      required: true,
      defaultValue: [],
      helpText: 'Tenants call or WhatsApp you directly on this number.',
      validation: {
        custom: (value: any) => {
          if (!Array.isArray(value) || value.length === 0) {
            return 'Please add or select at least one contact number';
          }
          return null;
        },
      },
    },
  ],
  submitButton: {
    label: 'Submit my listing',
    loadingLabel: 'Submitting...',
  },
};
