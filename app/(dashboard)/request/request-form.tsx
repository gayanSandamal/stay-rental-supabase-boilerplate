'use client';

import { useState } from 'react';

/**
 * Public lead-submission form (broker pivot, FORGE.md Concept 3). Plain
 * client-side fetch, not the config-driven form builder — six fields, no
 * reuse pressure, and the builder's validation/section machinery would be
 * overhead for a form this small.
 */
export function RequestForm() {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: form.get('city'),
          district: form.get('district') || null,
          bedrooms: form.get('bedrooms') ? Number(form.get('bedrooms')) : null,
          budgetMin: form.get('budgetMin') ? Number(form.get('budgetMin')) : null,
          budgetMax: form.get('budgetMax') ? Number(form.get('budgetMax')) : null,
          notes: form.get('notes') || null,
          contactPhone: form.get('contactPhone'),
          contactName: form.get('contactName') || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to submit');
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
        Sent. Brokers on Easy Rent can now see your requirement and get in touch directly —
        Easy Rent never takes a commission, and neither does posting this request cost
        anything.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input
          name="city"
          required
          placeholder="City (e.g. Colombo)"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <input
          name="district"
          placeholder="District (optional)"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <input
          name="bedrooms"
          type="number"
          min={1}
          placeholder="Bedrooms"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <input
            name="budgetMin"
            type="number"
            placeholder="Min LKR"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-1/2"
          />
          <input
            name="budgetMax"
            type="number"
            placeholder="Max LKR"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-1/2"
          />
        </div>
      </div>
      <textarea
        name="notes"
        placeholder="Anything else brokers should know"
        maxLength={1000}
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
        rows={3}
      />
      <div className="grid grid-cols-2 gap-3">
        <input
          name="contactPhone"
          required
          placeholder="Your phone number"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <input
          name="contactName"
          placeholder="Your name (optional)"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 text-sm font-semibold bg-teal-700 text-white rounded-lg hover:bg-teal-800 disabled:opacity-50"
      >
        {loading ? 'Sending…' : 'Post my request'}
      </button>
    </form>
  );
}
