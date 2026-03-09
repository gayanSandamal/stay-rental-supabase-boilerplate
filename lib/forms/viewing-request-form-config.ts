import { FormConfig } from '@/components/form-builder';

export const viewingRequestFormConfig: FormConfig = {
  title: 'Request Viewing',
  description: 'Fill in your details to schedule a property viewing',
  layout: {
    type: 'single',
  },
  fields: [
    {
      name: 'tenantName',
      label: 'Name',
      type: 'text',
      placeholder: 'Your full name',
      required: true,
      validation: {
        minLength: 2,
      },
    },
    {
      name: 'tenantEmail',
      label: 'Email',
      type: 'email',
      placeholder: 'your@email.com',
      required: true,
      validation: {
        pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
      },
    },
    {
      name: 'tenantPhone',
      label: 'Phone',
      type: 'tel',
      placeholder: '+94 XX XXX XXXX',
      required: true,
      helpText: 'Include country code',
    },
    {
      name: 'preferredDate',
      label: 'Preferred Date',
      type: 'date',
      helpText: 'When would you like to view the property?',
    },
    {
      name: 'preferredTime',
      label: 'Preferred Time',
      type: 'text',
      placeholder: 'e.g., Morning, Afternoon, Evening',
    },
    {
      name: 'notes',
      label: 'Additional Notes',
      type: 'textarea',
      rows: 3,
      placeholder: 'Any special requests or questions...',
    },
  ],
  submitButton: {
    label: 'Request Viewing',
    loadingLabel: 'Submitting...',
  },
};

