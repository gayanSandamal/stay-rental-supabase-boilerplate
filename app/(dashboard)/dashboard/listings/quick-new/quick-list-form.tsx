'use client';

import { FormBuilder } from '@/components/form-builder';
import { formConfigs } from '@/lib/forms';
import { CheckCircle2, MessageCircle, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export function QuickListForm({ landlordId }: { landlordId: number }) {
  const [submittedTitle, setSubmittedTitle] = useState<string | null>(null);

  const handleSubmit = async (data: Record<string, any>) => {
    const response = await fetch('/api/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        landlordId,
        status: 'pending',
      }),
    });

    if (!response.ok) {
      if (response.status === 409) {
        throw new Error(
          'Looks like this address is already listed — check your dashboard for the existing listing.'
        );
      }
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create listing');
    }

    // In-place success panel instead of a redirect — we want the photo
    // follow-up CTA in front of the landlord while they're engaged.
    setSubmittedTitle(String(data.title ?? 'your listing'));
  };

  if (submittedTitle) {
    // NB: no WhatsApp photo follow-up here — the concierge number feeds the
    // automated intake pipeline, which has no attach-photos-to-existing-listing
    // path; photos for a form-created listing go in via the dashboard.
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center space-y-5">
        <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
        <h2 className="text-2xl font-extrabold text-slate-900">Submitted!</h2>
        <p className="text-slate-600 max-w-md mx-auto">
          <strong>{submittedTitle}</strong> is in — add photos now so it goes
          live faster. Our team reviews it shortly.
        </p>
        <Link
          href="/dashboard/listings"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-md transition-colors"
        >
          <MessageCircle className="h-4 w-4" />
          Add photos to your listing
        </Link>
        <div>
          <Link
            href="/dashboard/listings"
            className="inline-flex items-center gap-1.5 text-teal-700 font-medium hover:underline text-sm"
          >
            View my listings
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <FormBuilder
      config={{
        ...formConfigs.quickList,
        onSubmit: handleSubmit,
      }}
    />
  );
}
