'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

type BulkRenewButtonProps = {
  listingIds: number[];
};

export function BulkRenewButton({ listingIds }: BulkRenewButtonProps) {
  const [loading, setLoading] = useState(false);
  const [renewed, setRenewed] = useState<number | null>(null);

  const handleRenew = async () => {
    setLoading(true);
    setRenewed(null);
    try {
      const res = await fetch('/api/listings/bulk-renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingIds }),
      });
      const data = await res.json();
      if (res.ok) {
        setRenewed(data.renewed);
        window.location.reload();
      } else {
        alert(data.error || 'Failed to renew');
      }
    } catch {
      alert('Failed to renew');
    } finally {
      setLoading(false);
    }
  };

  if (listingIds.length === 0) return null;

  return (
    <Button onClick={handleRenew} disabled={loading} variant="outline" size="sm">
      <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
      {loading ? 'Renewing...' : `Renew all ${listingIds.length} expiring`}
    </Button>
  );
}
