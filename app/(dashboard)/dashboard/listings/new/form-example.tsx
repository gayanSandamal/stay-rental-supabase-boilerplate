'use client';

import { FormBuilder } from '@/components/form-builder';
import { formConfigs } from '@/lib/forms';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function ListingFormExample() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (data: Record<string, any>) => {
    setIsSubmitting(true);
    try {
      // Get landlordId from somewhere (e.g., props, context, or API)
      const landlordId = 1; // This should come from your auth context

      const response = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          landlordId,
          status: 'pending',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create listing');
      }

      const result = await response.json();
      router.push(`/dashboard/listings/${result.listing.id}`);
    } catch (error: any) {
      throw error; // Re-throw to let FormBuilder handle the error display
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <FormBuilder
      config={{
        ...formConfigs.listing,
        onSubmit: handleSubmit,
        onCancel: handleCancel,
      }}
    />
  );
}

