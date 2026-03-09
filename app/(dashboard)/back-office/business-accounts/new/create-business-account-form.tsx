'use client';

import { useRouter } from 'next/navigation';
import { FormBuilder } from '@/components/form-builder';
import { formConfigs } from '@/lib/forms';

export function CreateBusinessAccountForm() {
  const router = useRouter();

  const handleSubmit = async (data: Record<string, any>) => {
    try {
      const response = await fetch('/api/business-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          phone: data.phone || null,
          address: data.address || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create business account');
      }

      const result = await response.json();
      router.push(`/back-office/business-accounts/${result.businessAccount.id}`);
    } catch (error: any) {
      throw error; // Re-throw to let FormBuilder handle the error display
    }
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <FormBuilder
      config={{
        ...formConfigs.businessAccount,
        onSubmit: handleSubmit,
        onCancel: handleCancel,
      }}
    />
  );
}
