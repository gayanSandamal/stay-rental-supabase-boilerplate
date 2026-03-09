import { FormConfig } from '@/components/form-builder';

export const addTeamMemberFormConfig: FormConfig = {
  // title: 'Add Team Member',
  description: 'Add an existing user to this business account as a team member',
  layout: {
    type: 'single',
  },
  fields: [
    {
      name: 'email',
      label: 'User Email',
      type: 'email',
      placeholder: 'user@example.com',
      required: true,
      validation: {
        pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
      },
      helpText: 'Enter the email of an existing user to add them to this business account',
    },
    {
      name: 'role',
      label: 'Role',
      type: 'select',
      options: [
        { label: 'Member', value: 'member' },
        { label: 'Admin', value: 'admin' },
        { label: 'Owner', value: 'owner' },
      ],
      required: true,
      defaultValue: 'member',
      helpText: 'Select the role for this team member',
    },
  ],
  submitButton: {
    label: 'Add Team Member',
    className: 'bg-teal-800 hover:bg-teal-900',
    loadingLabel: 'Adding...',
  },
  cancelButton: {
    label: 'Cancel',
    show: true,
  },
};

