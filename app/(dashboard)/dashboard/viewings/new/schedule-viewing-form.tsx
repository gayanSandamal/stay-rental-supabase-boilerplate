'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';

type Lead = {
  id: number;
  tenantName: string;
  tenantEmail: string;
  listingId: number;
  listing?: { title?: string } | null;
} | null;

export function ScheduleViewingForm({
  leadId,
  lead,
}: {
  leadId: number | null;
  lead: Lead;
}) {
  const router = useRouter();
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!leadId || !lead) {
      setError('Please select a lead first. Go to Leads and click "Schedule Viewing" on a lead.');
      return;
    }

    if (!scheduledDate || !scheduledTime) {
      setError('Please enter both date and time.');
      return;
    }

    const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`);
    if (isNaN(scheduledAt.getTime())) {
      setError('Invalid date or time.');
      return;
    }

    if (scheduledAt < new Date()) {
      setError('Please select a future date and time.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/viewings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          scheduledAt: scheduledAt.toISOString(),
          notes: notes || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to schedule viewing');
      }

      router.push('/dashboard/viewings');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (!leadId) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground mb-4">
            No lead selected. Schedule a viewing from the Leads page by clicking
            &quot;Schedule Viewing&quot; on a lead.
          </p>
          <Button asChild variant="outline">
            <Link href="/dashboard/leads">Go to Leads</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!lead) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground mb-4">
            Lead not found. It may have been deleted.
          </p>
          <Button asChild variant="outline">
            <Link href="/dashboard/leads">Back to Leads</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-6">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/dashboard/leads/${leadId}`} className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Lead
            </Link>
          </Button>
        </div>

        <div className="mb-6 p-3 bg-slate-50 rounded-lg">
          <p className="text-sm font-medium">{lead.tenantName}</p>
          <p className="text-xs text-slate-500">{lead.tenantEmail}</p>
          {lead.listing?.title && (
            <p className="text-xs text-slate-600 mt-1">
              Listing: {lead.listing.title}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="scheduledDate" className="block text-sm font-medium mb-1">
                Date
              </label>
              <input
                id="scheduledDate"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label htmlFor="scheduledTime" className="block text-sm font-medium mb-1">
                Time
              </label>
              <input
                id="scheduledTime"
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium mb-1">
              Notes (optional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Any meeting instructions or reminders..."
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={loading}>
              {loading ? 'Scheduling...' : 'Schedule Viewing'}
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link href="/dashboard/viewings">Cancel</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
