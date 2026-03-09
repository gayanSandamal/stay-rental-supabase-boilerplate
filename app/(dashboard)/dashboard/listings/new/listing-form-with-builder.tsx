'use client';

import { FormBuilder } from '@/components/form-builder';
import { formConfigs } from '@/lib/forms';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface ListingFormWithBuilderProps {
  landlordId: number;
  businessAccountId?: number | null;
  createdBy?: number;
}

export function ListingFormWithBuilder({ 
  landlordId, 
  businessAccountId,
  createdBy 
}: ListingFormWithBuilderProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (data: Record<string, any>) => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          landlordId,
          businessAccountId: businessAccountId || null,
          createdBy: createdBy || null,
          status: 'pending',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create listing');
      }

      const result = await response.json();
      router.push(`/dashboard/listings`);
    } catch (error: any) {
      throw error; // Re-throw to let FormBuilder handle the error display
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  // Update contact numbers field with businessAccountId
  const configWithBusinessAccount = {
    ...formConfigs.listing,
    fields: formConfigs.listing.fields.map((field) => {
      if (field.type === 'contact-numbers') {
        return {
          ...field,
          businessAccountId: businessAccountId || null,
        };
      }
      return field;
    }),
    onSubmit: handleSubmit,
    onCancel: handleCancel,
  };

  return <FormBuilder config={configWithBusinessAccount} />;
}

