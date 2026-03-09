'use client';

import { useState, useEffect, FormEvent } from 'react';
import { FormField, FormFieldConfig, shouldShowField } from './form-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FormLayout {
  type: 'single' | 'grid' | 'custom';
  columns?: number; // For grid layout
  gap?: number; // Gap between fields
  className?: string;
}

export interface FormConfig {
  title?: string;
  description?: string;
  fields: FormFieldConfig[];
  layout?: FormLayout;
  submitButton?: {
    label?: string;
    className?: string;
    loadingLabel?: string;
  };
  cancelButton?: {
    label?: string;
    className?: string;
    show?: boolean;
  };
  onSubmit?: (data: Record<string, any>) => Promise<void> | void;
  onCancel?: () => void;
  className?: string;
  defaultValues?: Record<string, any>;
  validation?: {
    [fieldName: string]: (value: any, allValues: Record<string, any>) => string | null;
  };
}

interface FormBuilderProps {
  config: FormConfig;
}

export function FormBuilder({ config }: FormBuilderProps) {
  // Initialize formData with defaultValues from config and field defaults
  const initializeFormData = () => {
    const initial: Record<string, any> = { ...config.defaultValues };
    
    // Add field default values if not already set
    config.fields.forEach((field) => {
      if (initial[field.name] === undefined && field.defaultValue !== undefined) {
        initial[field.name] = field.defaultValue;
      }
    });
    
    return initial;
  };

  const [formData, setFormData] = useState<Record<string, any>>(initializeFormData());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Sync formData with defaultValues when they change (e.g., from URL params)
  useEffect(() => {
    if (config.defaultValues) {
      const updated = { ...config.defaultValues };
      // Preserve field defaults for fields not in defaultValues
      config.fields.forEach((field) => {
        if (updated[field.name] === undefined && field.defaultValue !== undefined) {
          updated[field.name] = field.defaultValue;
        }
      });
      setFormData(updated);
    }
  }, [config.defaultValues]);

  const updateField = (name: string, value: any) => {
    setFormData((prev) => {
      const updated = { ...prev, [name]: value };
      
      // Clear dependent fields when parent field changes
      // This prevents stale values in hidden fields
      config.fields.forEach((field) => {
        if (field.showIf || field.hideIf) {
          const conditions = [
            ...(field.showIf ? (Array.isArray(field.showIf) ? field.showIf : [field.showIf]) : []),
            ...(field.hideIf ? (Array.isArray(field.hideIf) ? field.hideIf : [field.hideIf]) : []),
          ];
          
          // If this field depends on the changed field, and condition no longer matches, clear it
          conditions.forEach((condition) => {
            if (condition.field === name) {
              const shouldShow = shouldShowField(field, updated);
              if (!shouldShow && updated[field.name] !== undefined) {
                // Field is now hidden, clear its value
                delete updated[field.name];
              }
            }
          });
        }
      });
      
      return updated;
    });
    
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const validateField = (
    field: FormFieldConfig,
    value: any,
    allValues: Record<string, any>
  ): string | null => {
    // Skip validation for hidden fields
    if (!shouldShowField(field, allValues)) {
      return null;
    }

    // Required validation
    if (field.required) {
      // Handle arrays (e.g., contactNumbers)
      if (Array.isArray(value)) {
        if (value.length === 0) {
          return `${field.label} is required - please select at least one`;
        }
      } else if (value === '' || value === null || value === undefined) {
        return `${field.label} is required`;
      }
    }

    // Custom validation from config
    if (config.validation?.[field.name]) {
      const error = config.validation[field.name](value, allValues);
      if (error) return error;
    }

    // Field-specific validation
    if (field.validation) {
      if (field.validation.minLength && String(value).length < field.validation.minLength) {
        return `${field.label} must be at least ${field.validation.minLength} characters`;
      }
      if (field.validation.maxLength && String(value).length > field.validation.maxLength) {
        return `${field.label} must be at most ${field.validation.maxLength} characters`;
      }
      if (field.validation.pattern) {
        const regex = new RegExp(field.validation.pattern);
        if (!regex.test(String(value))) {
          return `${field.label} format is invalid`;
        }
      }
      if (field.validation.custom) {
        const error = field.validation.custom(value);
        if (error) return error;
      }
    }

    return null;
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    config.fields.forEach((field) => {
      // Only validate visible fields
      if (!shouldShowField(field, formData)) {
        return;
      }
      
      const value = formData[field.name];
      const error = validateField(field, value, formData);
      if (error) {
        newErrors[field.name] = error;
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(false);

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      if (config.onSubmit) {
        await config.onSubmit(formData);
        setSubmitSuccess(true);
      }
    } catch (error: any) {
      setSubmitError(error.message || 'An error occurred while submitting the form');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (config.onCancel) {
      config.onCancel();
    }
  };

  const renderFields = () => {
    const layout = config.layout || { type: 'single' };
    
    // Filter fields based on visibility - this ensures fields appear/disappear dynamically
    // Sections are always visible, other fields depend on their conditions
    const visibleFields = config.fields.filter(field => {
      // Always show section fields
      if (field.type === 'section') {
        return true;
      }
      const shouldShow = shouldShowField(field, formData);
      return shouldShow;
    });

    // Create a key based on visible fields and formData values that affect visibility
    // This ensures re-render when dependent fields change
    const dependentFields = config.fields
      .filter(f => f.showIf || f.hideIf)
      .flatMap(f => {
        const conditions = [
          ...(f.showIf ? (Array.isArray(f.showIf) ? f.showIf : [f.showIf]) : []),
          ...(f.hideIf ? (Array.isArray(f.hideIf) ? f.hideIf : [f.hideIf]) : []),
        ];
        return conditions.map(c => `${c.field}:${formData[c.field] || ''}`);
      });
    const visibilityKey = `${visibleFields.map(f => f.name).join(',')}-${dependentFields.join('|')}`;

    if (layout.type === 'grid' && layout.columns) {
      return (
        <div
          key={visibilityKey}
          className={cn(
            'grid gap-4',
            layout.columns === 2 && 'md:grid-cols-2',
            layout.columns === 3 && 'md:grid-cols-3',
            layout.columns === 4 && 'md:grid-cols-4',
            layout.className
          )}
        >
          {visibleFields.map((field) => (
            <FormField
              key={field.name}
              {...field}
              value={formData[field.name]}
              onChange={(value) => updateField(field.name, value)}
              error={errors[field.name]}
              allFormValues={formData}
            />
          ))}
        </div>
      );
    }

    if (layout.type === 'custom') {
      return (
        <div key={visibilityKey} className={cn('space-y-4', layout.className)}>
          {visibleFields.map((field) => (
            <FormField
              key={field.name}
              {...field}
              value={formData[field.name]}
              onChange={(value) => updateField(field.name, value)}
              error={errors[field.name]}
              allFormValues={formData}
            />
          ))}
        </div>
      );
    }

    // Default: single column
    return (
      <div key={visibilityKey} className={cn('space-y-4', layout.className)}>
        {visibleFields.map((field) => (
          <FormField
            key={field.name}
            {...field}
            value={formData[field.name]}
            onChange={(value) => updateField(field.name, value)}
            error={errors[field.name]}
            allFormValues={formData}
          />
        ))}
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-6', config.className)}>
      {config.title && (
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{config.title}</h2>
          {config.description && (
            <p className="text-gray-600 mt-1">{config.description}</p>
          )}
        </div>
      )}

      {renderFields()}

      {submitError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">{submitError}</p>
        </div>
      )}

      {submitSuccess && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-md">
          <p className="text-sm text-green-800">Form submitted successfully!</p>
        </div>
      )}

      <div className="flex gap-4">
        <Button
          type="submit"
          disabled={isSubmitting}
          className={cn(
            'bg-blue-600 hover:bg-blue-700',  // Changed from orange
            config.submitButton?.className
          )}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {config.submitButton?.loadingLabel || 'Submitting...'}
            </>
          ) : (
            config.submitButton?.label || 'Submit'
          )}
        </Button>

        {config.cancelButton?.show && (
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isSubmitting}
            className={config.cancelButton?.className}
          >
            {config.cancelButton?.label || 'Cancel'}
          </Button>
        )}
      </div>
    </form>
  );
}

