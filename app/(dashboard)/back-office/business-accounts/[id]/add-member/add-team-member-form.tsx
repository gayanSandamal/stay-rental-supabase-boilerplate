'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FormBuilder } from '@/components/form-builder';
import { formConfigs } from '@/lib/forms';
import { Card, CardContent } from '@/components/ui/card';

interface AddTeamMemberFormProps {
  businessAccountId: number;
}

export function AddTeamMemberForm({ businessAccountId }: AddTeamMemberFormProps) {
  const router = useRouter();
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (data: Record<string, any>) => {
    try {
      // First, find user by email
      const userResponse = await fetch(`/api/user?email=${encodeURIComponent(data.email)}`);
      if (!userResponse.ok) {
        throw new Error('User not found. Please make sure the user exists in the system.');
      }

      const userData = await userResponse.json();
      if (!userData.user) {
        throw new Error('User not found. Please make sure the user exists in the system.');
      }

      // Add user to business account
      const response = await fetch(`/api/business-accounts/${businessAccountId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userData.user.id,
          role: data.role || 'member',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add team member');
      }

      setSuccess(true);
      setTimeout(() => {
        router.push(`/back-office/business-accounts/${businessAccountId}`);
      }, 1500);
    } catch (error: any) {
      throw error; // Re-throw to let FormBuilder handle the error display
    }
  };

  const handleCancel = () => {
    router.back();
  };

  if (success) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="text-green-600 mb-4">✓ Team member added successfully!</div>
          <p className="text-sm text-gray-600">Redirecting...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <FormBuilder
      config={{
        ...formConfigs.addTeamMember,
        onSubmit: handleSubmit,
        onCancel: handleCancel,
      }}
    />
  );
}

