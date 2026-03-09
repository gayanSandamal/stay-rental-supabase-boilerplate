import { FormConfig } from '@/components/form-builder';

export const businessAccountFormConfig: FormConfig = {
  title: 'Create Business Account',
  description: 'Enter the business information to create a new business account',
  layout: {
    type: 'single',
  },
  fields: [
    {
      name: 'name',
      label: 'Business Name',
      type: 'text',
      placeholder: 'e.g., ABC Real Estate',
      required: true,
      validation: {
        minLength: 2,
        maxLength: 200,
      },
      helpText: 'The official name of the business',
    },
    {
      name: 'email',
      label: 'Email',
      type: 'email',
      placeholder: 'contact@business.com',
      required: true,
      validation: {
        pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
      },
      helpText: 'Business contact email address',
    },
    {
      name: 'phone',
      label: 'Phone',
      type: 'tel',
      placeholder: '+94 XX XXX XXXX',
      helpText: 'Business contact phone number (optional)',
    },
    {
      name: 'address',
      label: 'Address',
      type: 'textarea',
      placeholder: 'Business address',
      rows: 3,
      helpText: 'Physical address of the business (optional)',
    },
  ],
  submitButton: {
    label: 'Create Business Account',
    className: 'bg-blue-600 hover:bg-blue-700',
    loadingLabel: 'Creating...',
  },
  cancelButton: {
    label: 'Cancel',
    show: true,
  },
};

