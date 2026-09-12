'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FormBuilder } from '@/components/form-builder';
import { formConfigs } from '@/lib/forms';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Self-serve business-account creation (broker pivot Phase 1 remainder —
 * before this, provisioning was 100% back-office, per STATUS.md). Same
 * FormBuilder config as the back-office flow; only the submit target and
 * redirect differ.
 */
export function CreateBusinessAccountForm() {
  const router = useRouter();

  const handleSubmit = async (data: Record<string, any>) => {
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
    router.refresh();
  };

  return (
    <FormBuilder
      config={{
        ...formConfigs.businessAccount,
        onSubmit: handleSubmit,
        onCancel: () => router.back(),
      }}
    />
  );
}

export function InviteTeamMemberForm({ businessAccountId }: { businessAccountId: number }) {
  const router = useRouter();
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (data: Record<string, any>) => {
    const userResponse = await fetch(`/api/user?email=${encodeURIComponent(data.email)}`);
    if (!userResponse.ok) {
      throw new Error('User not found. They need an Easy Rent account first.');
    }
    const userData = await userResponse.json();
    if (!userData.user) {
      throw new Error('User not found. They need an Easy Rent account first.');
    }

    const response = await fetch(`/api/business-accounts/${businessAccountId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: userData.user.id, role: data.role || 'member' }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to invite team member');
    }
    setSuccess(true);
    setTimeout(() => {
      setSuccess(false);
      router.refresh();
    }, 1500);
  };

  if (success) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-emerald-700">
          Team member added.
        </CardContent>
      </Card>
    );
  }

  return (
    <FormBuilder config={{ ...formConfigs.addTeamMember, onSubmit: handleSubmit }} />
  );
}

export function RemoveTeamMemberButton({
  businessAccountId,
  memberId,
}: {
  businessAccountId: number;
  memberId: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleRemove = async () => {
    if (!confirm('Remove this team member?')) return;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/business-accounts/${businessAccountId}/members/${memberId}`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to remove team member');
      }
      router.refresh();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleRemove}
      disabled={loading}
      className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
    >
      {loading ? 'Removing…' : 'Remove'}
    </button>
  );
}
