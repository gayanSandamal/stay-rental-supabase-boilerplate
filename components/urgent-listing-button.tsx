'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Clock } from 'lucide-react';

type UrgentListingButtonProps = {
  listingId: number;
  urgentUntil: Date | string | null;
  isAdminOrOps: boolean;
};

export function UrgentListingButton({
  listingId,
  urgentUntil,
  isAdminOrOps,
}: UrgentListingButtonProps) {
  const [loading, setLoading] = useState(false);
  const [urgentUntilState, setUrgentUntilState] = useState(urgentUntil);

  const isUrgent =
    urgentUntilState &&
    new Date(urgentUntilState) > new Date();

  const handleActivate = async () => {
    if (!isAdminOrOps) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/listings/${listingId}/urgent`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.urgentUntil) {
        setUrgentUntilState(data.urgentUntil);
      } else {
        alert(data.error || 'Failed to activate Urgent');
      }
    } catch (e) {
      alert('Failed to activate Urgent');
    } finally {
      setLoading(false);
    }
  };

  if (isUrgent) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-rose-100 text-rose-800 border border-rose-200">
        <Clock className="h-3.5 w-3.5" />
        Urgent until {new Date(urgentUntilState!).toLocaleDateString('en-US')}
      </span>
    );
  }

  if (isAdminOrOps) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={handleActivate}
        disabled={loading}
        className="border-rose-300 text-rose-800 hover:bg-rose-50"
      >
        <Clock className="h-4 w-4 mr-1.5" />
        {loading ? 'Activating...' : 'Activate Urgent (LKR 150/7d)'}
      </Button>
    );
  }

  return (
    <p className="text-sm text-slate-600">
      Need quick action? Add Urgent badge for 7 days for LKR 150.{' '}
      <a
        href="mailto:support@easyrent.lk?subject=Urgent%20Badge%20Request"
        className="text-teal-600 font-medium hover:underline"
      >
        Contact support
      </a>{' '}
      after payment.
    </p>
  );
}
