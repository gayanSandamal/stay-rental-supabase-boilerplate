# Form Builder System

A flexible, JSON-driven form builder system that supports all field types, layouts, and validation.

## Components

### `FormField`
A reusable field component that supports:
- **Text inputs**: `text`, `email`, `tel`, `url`
- **Number inputs**: `number` (with min/max/step)
- **Textarea**: Multi-line text input
- **Select**: Dropdown with options
- **Checkbox**: Boolean toggle
- **Date**: Date picker

### `FormBuilder`
A form component that renders fields based on a configuration object.

### `FormLoader`
A component that loads form configs from JSON files (for dynamic loading).

## Usage

### Basic Example

```tsx
import { FormBuilder } from '@/components/form-builder';
import { formConfigs } from '@/lib/forms';

export function MyForm() {
  const handleSubmit = async (data: Record<string, any>) => {
    console.log('Form data:', data);
    // Submit to API
  };

  return (
    <FormBuilder
      config={{
        ...formConfigs.listing,
        onSubmit: handleSubmit,
      }}
    />
  );
}
```

### Using Pre-defined Configs

```tsx
import { formConfigs } from '@/lib/forms';
import { FormBuilder } from '@/components/form-builder';

// Use listing form
<FormBuilder config={formConfigs.listing} />

// Use viewing request form
<FormBuilder config={formConfigs.viewingRequest} />

// Use filter form
<FormBuilder config={formConfigs.filter} />
```

### Custom Form Config

```tsx
import { FormBuilder, FormConfig } from '@/components/form-builder';

const myConfig: FormConfig = {
  title: 'My Custom Form',
  fields: [
    {
      name: 'email',
      label: 'Email Address',
      type: 'email',
      required: true,
      placeholder: 'Enter your email',
      validation: {
        pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
      },
    },
    {
      name: 'age',
      label: 'Age',
      type: 'number',
      min: 18,
      max: 100,
    },
    {
      name: 'country',
      label: 'Country',
      type: 'select',
      options: [
        { label: 'Sri Lanka', value: 'lk' },
        { label: 'India', value: 'in' },
      ],
    },
  ],
  layout: {
    type: 'grid',
    columns: 2,
  },
  onSubmit: async (data) => {
    console.log(data);
  },
};

<FormBuilder config={myConfig} />
```

## Form Config Structure

```typescript
interface FormConfig {
  title?: string;                    // Form title
  description?: string;              // Form description
  fields: FormFieldConfig[];        // Array of field configurations
  layout?: FormLayout;               // Layout configuration
  submitButton?: {                   // Submit button config
    label?: string;
    loadingLabel?: string;
    className?: string;
  };
  cancelButton?: {                   // Cancel button config
    label?: string;
    show?: boolean;
    className?: string;
  };
  onSubmit?: (data: Record<string, any>) => Promise<void> | void;
  onCancel?: () => void;
  defaultValues?: Record<string, any>;
  validation?: {                     // Custom validation functions
    [fieldName: string]: (value: any, allValues: Record<string, any>) => string | null;
  };
}
```

## Field Config Structure

```typescript
interface FormFieldConfig {
  name: string;                      // Field name (required)
  label: string;                     // Field label
  type: FieldType;                   // Field type
  placeholder?: string;              // Placeholder text
  required?: boolean;                // Is field required?
  defaultValue?: string | number | boolean;
  options?: FieldOption[];           // For select fields
  min?: number;                      // For number/date fields
  max?: number;                      // For number/date fields
  step?: number;                     // For number fields
  rows?: number;                     // For textarea
  className?: string;                 // Custom CSS classes
  labelClassName?: string;
  inputClassName?: string;
  validation?: {                     // Field validation
    pattern?: string;                // Regex pattern
    minLength?: number;
    maxLength?: number;
    custom?: (value: any) => string | null;
  };
  helpText?: string;                 // Help text below field
  disabled?: boolean;
}
```

## Layout Types

### Single Column (Default)
```typescript
layout: {
  type: 'single',
}
```

### Grid Layout
```typescript
layout: {
  type: 'grid',
  columns: 2,  // or 3, 4
}
```

### Custom Layout
```typescript
layout: {
  type: 'custom',
  className: 'space-y-6',  // Custom Tailwind classes
}
```

## Validation

### Built-in Validation
- Required fields
- Min/Max length
- Regex patterns
- Min/Max values (for numbers)

### Custom Validation
```typescript
validation: {
  email: (value, allValues) => {
    if (!value.includes('@')) {
      return 'Invalid email format';
    }
    return null;
  },
}
```

## Examples

See the example files:
- `app/(dashboard)/dashboard/listings/new/form-example.tsx` - Listing form example
- `lib/forms/listing-form-config.ts` - Full listing form config
- `lib/forms/viewing-request-form-config.ts` - Viewing request form config
- `lib/forms/filter-form-config.ts` - Filter form config

