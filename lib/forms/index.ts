import { FormConfig } from '@/components/form-builder';
import { listingFormConfig } from './listing-form-config';
import { viewingRequestFormConfig } from './viewing-request-form-config';
import { filterFormConfig } from './filter-form-config';
import { businessAccountFormConfig } from './business-account-form-config';
import { addTeamMemberFormConfig } from './add-team-member-form-config';

export const formConfigs = {
  listing: listingFormConfig,
  viewingRequest: viewingRequestFormConfig,
  filter: filterFormConfig,
  businessAccount: businessAccountFormConfig,
  addTeamMember: addTeamMemberFormConfig,
};

export { FormBuilder } from '@/components/form-builder';
export { FormField, type FormFieldConfig, type FieldType } from '@/components/form-field';
export type { FormConfig, FormLayout } from '@/components/form-builder';

