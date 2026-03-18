'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Package } from 'lucide-react';

type BundleActivationButtonsProps = {
  listingId: number;
  isAdminOrOps: boolean;
};

const BUNDLES = [
  { id: 'quick_results' as const, label: 'Quick Results Pack', price: 'LKR 350', description: 'Boost + Urgent (7 days each)' },
  { id: 'priority_exposure' as const, label: 'Priority Exposure Pack', price: 'LKR 650', description: 'Featured + Urgent (7 days each)' },
  { id: 'starter' as const, label: 'Landlord Starter Bundle', price: 'LKR 1,000', description: 'Starter 30 days + 1 Boost' },
] as const;

export function BundleActivationButtons({
  listingId,
  isAdminOrOps,
}: BundleActivationButtonsProps) {
  const router = useRouter();
  const [loadingBundle, setLoadingBundle] = useState<string | null>(null);

  const handleActivate = async (bundleId: string) => {
    if (!isAdminOrOps) return;
    setLoadingBundle(bundleId);
    try {
      const res = await fetch(`/api/listings/${listingId}/bundle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle: bundleId }),
      });
      const data = await res.json();
      if (res.ok) {
        router.refresh();
      } else {
        alert(data.error || `Failed to activate ${bundleId}`);
      }
    } catch (e) {
      alert(`Failed to activate ${bundleId}`);
    } finally {
      setLoadingBundle(null);
    }
  };

  if (!isAdminOrOps) {
    return (
      <div className="space-y-3">
        <p className="text-xs font-medium text-gray-500">Visibility bundles</p>
        <div className="space-y-2">
          {BUNDLES.map((bundle) => (
            <div key={bundle.id} className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2">
              <p className="text-sm font-medium text-slate-800">{bundle.label} — {bundle.price}</p>
              <p className="text-xs text-slate-600 mt-0.5">{bundle.description}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-600">
          <a
            href="mailto:support@easyrent.lk?subject=Bundle%20Purchase"
            className="text-teal-600 font-medium hover:underline"
          >
            Contact support to purchase
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-gray-500">Bundles</p>
      <div className="flex flex-wrap gap-2">
        {BUNDLES.map((bundle) => {
          const isLoading = loadingBundle === bundle.id;
          return (
            <Button
              key={bundle.id}
              size="sm"
              variant="outline"
              onClick={() => handleActivate(bundle.id)}
              disabled={!!loadingBundle}
              className="border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              <Package className="h-3.5 w-3.5 mr-1.5" />
              {isLoading ? 'Activating...' : `${bundle.label} (${bundle.price})`}
            </Button>
          );
        })}
      </div>
      <p className="text-xs text-gray-500">
        Quick Results: Boost + Urgent. Priority Exposure: Featured + Urgent. Starter: 30-day plan + Boost.
      </p>
    </div>
  );
}
