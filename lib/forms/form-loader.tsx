'use client';

import { FormBuilder, FormConfig } from '@/components/form-builder';
import { formConfigs } from './index';

interface FormLoaderProps {
  configName: keyof typeof formConfigs;
  onSubmit?: (data: Record<string, any>) => Promise<void> | void;
  onCancel?: () => void;
  defaultValues?: Record<string, any>;
  className?: string;
}

/**
 * FormLoader - Loads pre-defined form configurations
 * 
 * Usage:
 * <FormLoader 
 *   configName="listing" 
 *   onSubmit={handleSubmit}
 *   defaultValues={{ city: 'Colombo' }}
 * />
 */
export function FormLoader({
  configName,
  onSubmit,
  onCancel,
  defaultValues,
  className,
}: FormLoaderProps) {
  const baseConfig = formConfigs[configName];
  
  if (!baseConfig) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
        <p className="text-sm text-red-800">
          Form config "{configName}" not found
        </p>
      </div>
    );
  }

  const config: FormConfig = {
    ...baseConfig,
    defaultValues: {
      ...baseConfig.defaultValues,
      ...defaultValues,
    },
    onSubmit: onSubmit || baseConfig.onSubmit,
    onCancel: onCancel || baseConfig.onCancel,
    className,
  };

  return <FormBuilder config={config} />;
}

