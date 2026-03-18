'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type LandlordPlanFormProps = {
  landlordId: number;
  landlordName: string;
  currentTier: string | null;
  currentExpiresAt: Date | string | null;
};

const TIERS = ['free', 'starter', 'pro', 'agency'] as const;

export function LandlordPlanForm({
  landlordId,
  landlordName,
  currentTier,
  currentExpiresAt,
}: LandlordPlanFormProps) {
  const [tier, setTier] = useState(currentTier || 'free');
  const [expiresAt, setExpiresAt] = useState(
    currentExpiresAt
      ? new Date(currentExpiresAt as string | Date).toISOString().slice(0, 10)
      : ''
  );
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/landlords/${landlordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          landlordPlanTier: tier,
          landlordPlanExpiresAt: expiresAt || null,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to update');
      }
    } catch {
      alert('Failed to update');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Landlord Plan</CardTitle>
        <p className="text-sm text-gray-600">{landlordName}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Plan Tier</label>
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Plan Expires (optional)
          </label>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <Button onClick={handleSave} disabled={loading} size="sm">
          {loading ? 'Saving...' : saved ? 'Saved' : 'Save Plan'}
        </Button>
      </CardContent>
    </Card>
  );
}
