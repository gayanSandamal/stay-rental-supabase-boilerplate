'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Zap } from 'lucide-react';

type BoostListingButtonProps = {
  listingId: number;
  boostedUntil: Date | string | null;
  isAdminOrOps: boolean;
  includedBoostsRemaining?: number;
};

export function BoostListingButton({
  listingId,
  boostedUntil,
  isAdminOrOps,
  includedBoostsRemaining = 0,
}: BoostListingButtonProps) {
  const router = useRouter();
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
        router.refresh();
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
      <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-100 text-amber-800 border border-amber-200">
        <Zap className="h-3.5 w-3.5 shrink-0" />
        Boosted until {new Date(boostedUntilState!).toLocaleDateString('en-US')}
      </span>
    );
  }

  if (isAdminOrOps) {
    return (
      <div className="space-y-1.5">
        {/* Full-width row (name left, price right): the Button base is
            whitespace-nowrap + shrink-0, so a single-string label overflows
            narrow cards instead of fitting them. */}
        <Button
          size="sm"
          variant="outline"
          onClick={handleActivate}
          disabled={loading}
          className="w-full justify-between border-amber-300 text-amber-800 hover:bg-amber-50"
        >
          <span className="flex items-center gap-1.5">
            <Zap className="h-4 w-4" />
            {loading ? 'Activating…' : 'Boost'}
          </span>
          <span className="text-xs font-normal text-amber-700/80">LKR 250 · 7d</span>
        </Button>
        {includedBoostsRemaining > 0 && (
          <p className="text-xs text-amber-700">
            {includedBoostsRemaining} included Boost{includedBoostsRemaining !== 1 ? 's' : ''} remaining this month
          </p>
        )}
      </div>
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
