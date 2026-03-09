'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from 'lucide-react';

export function ViewingRequestForm({ listingId }: { listingId: number }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const data = {
      listingId,
      tenantName: formData.get('tenantName') as string,
      tenantEmail: formData.get('tenantEmail') as string,
      tenantPhone: formData.get('tenantPhone') as string,
      preferredDate: formData.get('preferredDate') as string,
      preferredTime: formData.get('preferredTime') as string,
      notes: formData.get('notes') as string,
    };

    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit viewing request');
      }

      setSuccess(true);
      e.currentTarget.reset();
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="p-4 bg-green-50 border border-green-200 rounded-md">
        <p className="text-green-800 font-medium">
          Viewing request submitted successfully!
        </p>
        <p className="text-sm text-green-700 mt-1">
          Our team will contact you shortly to confirm the viewing.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="tenantName" className="mb-2 block">Name *</Label>
        <Input
          id="tenantName"
          name="tenantName"
          required
          placeholder="Your full name"
        />
      </div>

      <div>
        <Label htmlFor="tenantEmail" className="mb-2 block">Email *</Label>
        <Input
          id="tenantEmail"
          name="tenantEmail"
          type="email"
          required
          placeholder="your@email.com"
        />
      </div>

      <div>
        <Label htmlFor="tenantPhone" className="mb-2 block">Phone *</Label>
        <Input
          id="tenantPhone"
          name="tenantPhone"
          required
          placeholder="+94 XX XXX XXXX"
        />
      </div>

      <div>
        <Label htmlFor="preferredDate" className="mb-2 block">Preferred Date</Label>
        <Input
          id="preferredDate"
          name="preferredDate"
          type="date"
          min={new Date().toISOString().split('T')[0]}
        />
      </div>

      <div>
        <Label htmlFor="preferredTime" className="mb-2 block">Preferred Time</Label>
        <Input
          id="preferredTime"
          name="preferredTime"
          placeholder="e.g., Morning, Afternoon, Evening"
        />
      </div>

      <div>
        <Label htmlFor="notes" className="mb-2 block">Additional Notes</Label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
          placeholder="Any special requests or questions..."
        />
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <Button
        type="submit"
        className="w-full bg-orange-500 hover:bg-orange-600"
        disabled={isSubmitting}
      >
        <Calendar className="mr-2 h-4 w-4" />
        {isSubmitting ? 'Submitting...' : 'Request Viewing'}
      </Button>
    </form>
  );
}

