'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Star } from 'lucide-react';

type FeatureListingButtonProps = {
  listingId: number;
  featuredUntil: Date | string | null;
  isAdminOrOps: boolean;
};

export function FeatureListingButton({
  listingId,
  featuredUntil,
  isAdminOrOps,
}: FeatureListingButtonProps) {
  const [loading, setLoading] = useState(false);
  const [featuredUntilState, setFeaturedUntilState] = useState(featuredUntil);

  const isFeatured =
    featuredUntilState &&
    new Date(featuredUntilState) > new Date();

  const handleActivate = async () => {
    if (!isAdminOrOps) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/listings/${listingId}/feature`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.featuredUntil) {
        setFeaturedUntilState(data.featuredUntil);
      } else {
        alert(data.error || 'Failed to activate Featured');
      }
    } catch (e) {
      alert('Failed to activate Featured');
    } finally {
      setLoading(false);
    }
  };

  if (isFeatured) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800 border border-amber-200">
        <Star className="h-3.5 w-3.5" />
        Featured until {new Date(featuredUntilState!).toLocaleDateString('en-US')}
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
        <Star className="h-4 w-4 mr-1.5" />
        {loading ? 'Activating...' : 'Activate Featured (LKR 500/7d)'}
      </Button>
    );
  }

  return (
    <p className="text-sm text-slate-600">
      Maximum exposure: Featured placement for 7 days for LKR 500.{' '}
      <a
        href="mailto:support@easyrent.lk?subject=Featured%20Listing%20Request"
        className="text-teal-600 font-medium hover:underline"
      >
        Contact support
      </a>{' '}
      after payment.
    </p>
  );
}
