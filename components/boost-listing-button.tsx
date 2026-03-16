'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Zap } from 'lucide-react';

type BoostListingButtonProps = {
  listingId: number;
  boostedUntil: Date | string | null;
  isAdminOrOps: boolean;
};

export function BoostListingButton({
  listingId,
  boostedUntil,
  isAdminOrOps,
}: BoostListingButtonProps) {
  const [loading, setLoading] = useState(false);
  const [boostedUntilState, setBoostedUntilState] = useState(boostedUntil);

  const isBoosted =
    boostedUntilState &&
    new Date(boostedUntilState) > new Date();

  const handleActivate = async () => {
    if (!isAdminOrOps) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/listings/${listingId}/boost`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.boostedUntil) {
        setBoostedUntilState(data.boostedUntil);
      } else {
        alert(data.error || 'Failed to activate boost');
      }
    } catch (e) {
      alert('Failed to activate boost');
    } finally {
      setLoading(false);
    }
  };

  if (isBoosted) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800 border border-amber-200">
        <Zap className="h-3.5 w-3.5" />
        Boosted until {new Date(boostedUntilState!).toLocaleDateString('en-US')}
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
        className="border-amber-300 text-amber-800 hover:bg-amber-50"
      >
        <Zap className="h-4 w-4 mr-1.5" />
        {loading ? 'Activating...' : 'Activate Boost (LKR 250/7d)'}
      </Button>
    );
  }

  return (
    <p className="text-sm text-slate-600">
      Need faster results? Boost this listing for 7 days for LKR 250.{' '}
      <a
        href="mailto:support@easyrent.lk?subject=Boost%20Listing%20Request"
        className="text-teal-600 font-medium hover:underline"
      >
        Contact support
      </a>{' '}
      after payment.
    </p>
  );
}
