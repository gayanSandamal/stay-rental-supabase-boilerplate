# Form Builder System - Complete Guide

A comprehensive, reusable form builder system that supports all field types, layouts, and validation rules used throughout the Stay Rental application.

## 🎯 Overview

The form builder system consists of:
1. **FormField Component** - A single, reusable input component supporting all field types
2. **FormBuilder Component** - Renders complete forms from JSON/TypeScript configurations
3. **Pre-configured Forms** - Ready-to-use form configs for common use cases
4. **FormLoader** - Helper component to load pre-defined forms

## 📦 Components

### 1. FormField (`components/form-field.tsx`)

A universal field component that handles:
- ✅ Text inputs (text, email, tel, url)
- ✅ Number inputs (with min/max/step)
- ✅ Textarea (multi-line)
- ✅ Select dropdowns
- ✅ Checkboxes
- ✅ Date pickers
- ✅ Labels with spacing
- ✅ Validation error display
- ✅ Help text
- ✅ Custom styling

### 2. FormBuilder (`components/form-builder.tsx`)

A complete form component that:
- ✅ Renders fields from configuration
- ✅ Handles form state management
- ✅ Validates fields (built-in + custom)
- ✅ Supports multiple layouts (single, grid, custom)
- ✅ Shows loading states
- ✅ Displays success/error messages
- ✅ Handles form submission

### 3. Pre-configured Forms (`lib/forms/`)

Ready-to-use form configurations:
- **Listing Form** - Complete property listing form
- **Filter Form** - Listing filters form

## 🚀 Quick Start

### Basic Usage

```tsx
import { FormBuilder } from '@/components/form-builder';
import { formConfigs } from '@/lib/forms';

export function MyPage() {
  const handleSubmit = async (data: Record<string, any>) => {
    // Submit data to API
    const response = await fetch('/api/listings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
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

### Using FormLoader

```tsx
import { FormLoader } from '@/lib/forms/form-loader';

export function MyPage() {
  return (
    <FormLoader
      configName="listing"
      onSubmit={async (data) => {
        console.log(data);
      }}
      defaultValues={{ city: 'Colombo' }}
    />
  );
}
```

## 📝 Creating Custom Forms

### Simple Form

```tsx
import { FormBuilder, FormConfig } from '@/components/form-builder';

const myForm: FormConfig = {
  title: 'Contact Us',
  fields: [
    {
      name: 'name',
      label: 'Name',
      type: 'text',
      required: true,
    },
    {
      name: 'email',
      label: 'Email',
      type: 'email',
      required: true,
      validation: {
        pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
      },
    },
    {
      name: 'message',
      label: 'Message',
      type: 'textarea',
      rows: 5,
      required: true,
    },
  ],
  onSubmit: async (data) => {
    console.log('Submitted:', data);
  },
};

<FormBuilder config={myForm} />
```

### Grid Layout Form

```tsx
const gridForm: FormConfig = {
  title: 'Personal Information',
  layout: {
    type: 'grid',
    columns: 2, // 2-column grid
  },
  fields: [
    { name: 'firstName', label: 'First Name', type: 'text', required: true },
    { name: 'lastName', label: 'Last Name', type: 'text', required: true },
    { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'phone', label: 'Phone', type: 'tel' },
  ],
  onSubmit: async (data) => console.log(data),
};
```

### Form with Custom Validation

```tsx
const validatedForm: FormConfig = {
  fields: [
    {
      name: 'password',
      label: 'Password',
      type: 'text',
      required: true,
      validation: {
        minLength: 8,
        custom: (value) => {
          if (!/[A-Z]/.test(value)) {
            return 'Password must contain at least one uppercase letter';
          }
          if (!/[0-9]/.test(value)) {
            return 'Password must contain at least one number';
          }
          return null;
        },
      },
    },
    {
      name: 'confirmPassword',
      label: 'Confirm Password',
      type: 'text',
      required: true,
    },
  ],
  validation: {
    confirmPassword: (value, allValues) => {
      if (value !== allValues.password) {
        return 'Passwords do not match';
      }
      return null;
    },
  },
  onSubmit: async (data) => console.log(data),
};
```

## 🎨 Field Types Reference

### Text Input
```typescript
{
  name: 'title',
  label: 'Title',
  type: 'text',
  placeholder: 'Enter title',
  required: true,
}
```

### Email Input
```typescript
{
  name: 'email',
  label: 'Email',
  type: 'email',
  validation: {
    pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
  },
}
```

### Number Input
```typescript
{
  name: 'age',
  label: 'Age',
  type: 'number',
  min: 18,
  max: 100,
  step: 1,
}
```

### Textarea
```typescript
{
  name: 'description',
  label: 'Description',
  type: 'textarea',
  rows: 4,
  placeholder: 'Enter description...',
}
```

### Select Dropdown
```typescript
{
  name: 'country',
  label: 'Country',
  type: 'select',
  options: [
    { label: 'Sri Lanka', value: 'lk' },
    { label: 'India', value: 'in' },
  ],
}
```

### Checkbox
```typescript
{
  name: 'agree',
  label: 'I agree to the terms',
  type: 'checkbox',
  defaultValue: false,
}
```

### Date Input
```typescript
{
  name: 'birthDate',
  label: 'Birth Date',
  type: 'date',
  min: '1900-01-01',
  max: new Date().toISOString().split('T')[0],
}
```

## 📐 Layout Options

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
  columns: 2, // or 3, 4
}
```

### Custom Layout
```typescript
layout: {
  type: 'custom',
  className: 'space-y-6 grid grid-cols-1 md:grid-cols-2 gap-4',
}
```

## ✅ Validation

### Built-in Validations

1. **Required Fields**
```typescript
{
  name: 'email',
  required: true,
}
```

2. **Min/Max Length**
```typescript
{
  name: 'title',
  validation: {
    minLength: 10,
    maxLength: 200,
  },
}
```

3. **Pattern (Regex)**
```typescript
{
  name: 'phone',
  validation: {
    pattern: '^\\+94[0-9]{9}$',
  },
}
```

4. **Custom Field Validation**
```typescript
{
  name: 'password',
  validation: {
    custom: (value) => {
      if (value.length < 8) {
        return 'Password must be at least 8 characters';
      }
      return null;
    },
  },
}
```

5. **Cross-field Validation**
```typescript
validation: {
  confirmPassword: (value, allValues) => {
    if (value !== allValues.password) {
      return 'Passwords do not match';
    }
    return null;
  },
}
```

## 🎯 Real-World Examples

### Example 1: Listing Form
See `app/(dashboard)/dashboard/listings/new/form-example.tsx`

### Example 2: Filter Form
```tsx
import { FormBuilder } from '@/components/form-builder';
import { formConfigs } from '@/lib/forms';

<FormBuilder
  config={{
    ...formConfigs.filter,
    onSubmit: (data) => {
      // Apply filters to listings
      applyFilters(data);
    },
  }}
/>
```

## 🔧 Advanced Features

### Custom Styling
```typescript
{
  name: 'email',
  className: 'my-custom-class',
  labelClassName: 'text-blue-500',
  inputClassName: 'border-blue-300',
}
```

### Help Text
```typescript
{
  name: 'phone',
  label: 'Phone',
  helpText: 'Include country code (e.g., +94)',
}
```

### Default Values
```typescript
{
  name: 'city',
  defaultValue: 'Colombo',
}
```

Or pass via config:
```typescript
<FormBuilder
  config={{
    ...formConfig,
    defaultValues: {
      city: 'Colombo',
      bedrooms: 2,
    },
  }}
/>
```

### Disabled Fields
```typescript
{
  name: 'readonly',
  label: 'Read-only Field',
  type: 'text',
  disabled: true,
  defaultValue: 'Cannot edit',
}
```

## 📚 Available Form Configs

Import from `@/lib/forms`:

```typescript
import { formConfigs } from '@/lib/forms';

// Available configs:
formConfigs.listing          // Complete listing form
formConfigs.filter          // Filter form
```

## 🎨 Styling

All components use Tailwind CSS and follow the app's design system:
- Orange primary color (`bg-orange-500`)
- Consistent spacing (`mb-2` for labels)
- Error states (red borders and text)
- Focus states (orange ring)

## 📖 Full API Reference

See `lib/forms/README.md` for complete API documentation.

## 🚀 Next Steps

1. Use `FormBuilder` for all new forms
2. Create new form configs in `lib/forms/` as needed
3. Reuse `FormField` for custom form layouts
4. Extend field types as needed

---

**Created for Stay Rental Platform** - A flexible, maintainable form system for all your form needs!

