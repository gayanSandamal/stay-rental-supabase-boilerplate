'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ImageUploader } from '@/components/image-uploader';
import { ContactNumberSelector } from '@/components/contact-number-selector';
import { cn } from '@/lib/utils';

export type FieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'number'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'date'
  | 'url'
  | 'image-upload'
  | 'contact-numbers'
  | 'section';

export interface FieldOption {
  label: string;
  value: string;
}

// Conditional visibility configuration
export interface FieldCondition {
  field: string; // Field name to watch
  operator: 'equals' | 'notEquals' | 'in' | 'notIn' | 'contains' | 'greaterThan' | 'lessThan' | 'isTrue' | 'isFalse';
  value: any; // Value(s) to compare against
}

export interface FormFieldConfig {
  name: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string | number | boolean | string[];
  options?: FieldOption[]; // For select fields
  min?: number;
  max?: number;
  step?: number;
  rows?: number; // For textarea
  maxImages?: number; // For image-upload
  maxSizeInMB?: number; // For image-upload
  businessAccountId?: number | null; // For contact-numbers
  listingId?: number; // For contact-numbers
  className?: string;
  labelClassName?: string;
  inputClassName?: string;
  validation?: {
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    custom?: (value: any) => string | null; // Returns error message or null
  };
  helpText?: string;
  disabled?: boolean;
  // Conditional visibility
  showIf?: FieldCondition | FieldCondition[]; // Show field if condition(s) are met
  hideIf?: FieldCondition | FieldCondition[]; // Hide field if condition(s) are met
}

interface FormFieldProps extends FormFieldConfig {
  value?: any;
  onChange?: (value: any) => void;
  error?: string;
  allFormValues?: Record<string, any>; // All form values for conditional logic
}

// Helper function to evaluate field conditions
export function evaluateCondition(
  condition: FieldCondition,
  allFormValues: Record<string, any>
): boolean {
  const fieldValue = allFormValues[condition.field];
  
  // Handle undefined, null, and empty string as falsy for most operators
  // But allow empty string for equals/notEquals comparisons
  const isEmpty = fieldValue === undefined || fieldValue === null || fieldValue === '';

  switch (condition.operator) {
    case 'equals':
      // Direct comparison - empty string equals empty string
      return fieldValue === condition.value;
    case 'notEquals':
      // Direct comparison - empty string not equals non-empty
      return fieldValue !== condition.value;
    case 'in':
      if (isEmpty) return false;
      return Array.isArray(condition.value) && condition.value.includes(fieldValue);
    case 'notIn':
      if (isEmpty) return true;
      return Array.isArray(condition.value) && !condition.value.includes(fieldValue);
    case 'contains':
      if (isEmpty) return false;
      // Convert both to strings and do case-insensitive comparison
      const fieldStr = String(fieldValue).toLowerCase();
      const valueStr = String(condition.value).toLowerCase();
      return fieldStr.includes(valueStr);
    case 'greaterThan':
      if (isEmpty || isNaN(Number(fieldValue))) return false;
      return Number(fieldValue) > Number(condition.value);
    case 'lessThan':
      if (isEmpty || isNaN(Number(fieldValue))) return false;
      return Number(fieldValue) < Number(condition.value);
    case 'isTrue':
      // Check for true boolean, string 'true', or number 1
      if (fieldValue === true) return true;
      if (typeof fieldValue === 'string' && fieldValue.toLowerCase() === 'true') return true;
      if (fieldValue === 1) return true;
      return false;
    case 'isFalse':
      // Check for false boolean, string 'false', number 0, or empty/undefined
      if (fieldValue === false) return true;
      if (typeof fieldValue === 'string' && fieldValue.toLowerCase() === 'false') return true;
      if (fieldValue === 0) return true;
      if (isEmpty) return true;
      return false;
    default:
      return false;
  }
}

// Check if field should be visible
export function shouldShowField(
  field: FormFieldConfig,
  allFormValues: Record<string, any>
): boolean {
  // If no conditions, always show
  if (!field.showIf && !field.hideIf) {
    return true;
  }

  // Check hideIf conditions (any match = hide)
  if (field.hideIf) {
    const hideConditions = Array.isArray(field.hideIf) ? field.hideIf : [field.hideIf];
    const shouldHide = hideConditions.some(condition => 
      evaluateCondition(condition, allFormValues)
    );
    if (shouldHide) return false;
  }

  // Check showIf conditions (all must match = show)
  if (field.showIf) {
    const showConditions = Array.isArray(field.showIf) ? field.showIf : [field.showIf];
    const shouldShow = showConditions.every(condition => {
      const result = evaluateCondition(condition, allFormValues);
      return result;
    });
    // If showIf exists, field is only visible if all conditions are true
    return shouldShow;
  }

  // If only hideIf exists and none matched, show the field
  return true;
}

export function FormField({
  name,
  label,
  type,
  placeholder,
  required,
  defaultValue,
  options,
  min,
  max,
  step,
  rows = 4,
  maxImages,
  maxSizeInMB,
  businessAccountId,
  listingId,
  className,
  labelClassName,
  inputClassName,
  validation,
  helpText,
  disabled,
  value,
  onChange,
  error,
  allFormValues = {},
  showIf,
  hideIf,
}: FormFieldProps) {
  const fieldId = `field-${name}`;
  const displayValue = value !== undefined ? value : defaultValue;

  // Handle section divider - always visible, render early
  if (type === 'section') {
    return (
      <div className={cn('my-6', className)}>
        <div className="border-t border-gray-200 mb-4"></div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">{label}</h3>
        {helpText && (
          <p className="text-sm text-gray-600">{helpText}</p>
        )}
      </div>
    );
  }

  // Check if field should be visible (sections are handled above)
  const isVisible = shouldShowField({ name, showIf, hideIf } as FormFieldConfig, allFormValues);

  // Don't render if not visible
  if (!isVisible) {
    return null;
  }

  const handleChange = (newValue: any) => {
    if (onChange) {
      onChange(newValue);
    }
  };

  const renderInput = () => {
    switch (type) {
      case 'textarea':
        return (
          <textarea
            id={fieldId}
            name={name}
            placeholder={placeholder}
            required={required}
            disabled={disabled}
            rows={rows}
            value={displayValue || ''}
            onChange={(e) => handleChange(e.target.value)}
            className={cn(
              'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500',
              error && 'border-red-500',
              inputClassName
            )}
          />
        );

      case 'select':
        return (
          <select
            id={fieldId}
            name={name}
            required={required}
            disabled={disabled}
            value={displayValue || ''}
            onChange={(e) => handleChange(e.target.value)}
            className={cn(
              'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500',
              error && 'border-red-500',
              inputClassName
            )}
          >
            {!required && <option value="">Select {label}</option>}
            {options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case 'checkbox':
        return (
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id={fieldId}
              name={name}
              checked={displayValue || false}
              onChange={(e) => handleChange(e.target.checked)}
              disabled={disabled}
              className={cn(
                'h-4 w-4 text-orange-500 focus:ring-orange-500 border-gray-300 rounded',
                error && 'border-red-500',
                inputClassName
              )}
            />
            <Label
              htmlFor={fieldId}
              className={cn('cursor-pointer', labelClassName)}
            >
              {label}
              {required && <span className="text-red-500 ml-1">*</span>}
            </Label>
          </div>
        );

      case 'image-upload':
        return (
          <ImageUploader
            value={Array.isArray(displayValue) ? displayValue : []}
            onChange={handleChange}
            maxImages={maxImages}
            maxSizeInMB={maxSizeInMB}
            disabled={disabled}
          />
        );

      case 'contact-numbers':
        return (
          <ContactNumberSelector
            value={Array.isArray(displayValue) ? displayValue : []}
            onChange={handleChange}
            businessAccountId={businessAccountId}
            listingId={listingId}
          />
        );

      default:
        return (
          <Input
            id={fieldId}
            name={name}
            type={type}
            placeholder={placeholder}
            required={required}
            disabled={disabled}
            min={min}
            max={max}
            step={step}
            value={displayValue || ''}
            onChange={(e) => handleChange(e.target.value)}
            className={cn(error && 'border-red-500', inputClassName)}
          />
        );
    }
  };

  // For checkbox, label is rendered inside the component
  if (type === 'checkbox') {
    return (
      <div className={cn('space-y-1', className)}>
        {renderInput()}
        {helpText && (
          <p className="text-xs text-gray-500 mt-1">{helpText}</p>
        )}
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    );
  }

  return (
    <div className={cn('space-y-1', className)}>
      <Label
        htmlFor={fieldId}
        className={cn('mb-2 block', labelClassName)}
      >
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      {renderInput()}
      {helpText && (
        <p className="text-xs text-gray-500 mt-1">{helpText}</p>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

