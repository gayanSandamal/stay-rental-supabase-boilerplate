'use client';

import { useState } from 'react';
import { Phone } from 'lucide-react';

type ClaimedLead = { contactPhone: string; contactName: string | null };

export function ClaimLeadButton({ leadId }: { leadId: number }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<ClaimedLead | null>(null);

  const handleClaim = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/leads/${leadId}/claim`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to claim lead');
      }
      // Revealed only here, only to the claimant — never in the open GET
      // /api/leads list.
      setClaimed({ contactPhone: data.lead.contactPhone, contactName: data.lead.contactName });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (claimed) {
    return (
      <div className="flex items-center gap-2 text-sm font-semibold text-teal-800">
        <Phone className="h-3.5 w-3.5" />
        {claimed.contactName ? `${claimed.contactName} — ` : ''}
        <a href={`tel:${claimed.contactPhone}`} className="underline">
          {claimed.contactPhone}
        </a>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={handleClaim}
        disabled={loading}
        className="px-3 py-1.5 text-xs font-semibold bg-teal-700 text-white rounded-lg hover:bg-teal-800 disabled:opacity-50"
      >
        {loading ? 'Claiming…' : 'Claim this lead'}
      </button>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
