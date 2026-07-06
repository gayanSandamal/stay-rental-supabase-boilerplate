'use client';

import { FormBuilder } from '@/components/form-builder';
import { formConfigs } from '@/lib/forms';
import { useFeatureFlag } from '@/lib/hooks/use-feature-flags';
import { getConciergeWhatsAppLink } from '@/lib/site-config';
import { CheckCircle2, MessageCircle, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export function QuickListForm({ landlordId }: { landlordId: number }) {
  const [submittedTitle, setSubmittedTitle] = useState<string | null>(null);
  const conciergeEnabled = useFeatureFlag('enableWhatsAppConcierge');

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
          'Looks like this address is already listed — check your dashboard, or WhatsApp us and we\'ll sort it out.'
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
    const conciergeLink = conciergeEnabled
      ? getConciergeWhatsAppLink(`photos for: ${submittedTitle}`)
      : null;

    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center space-y-5">
        <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
        <h2 className="text-2xl font-extrabold text-slate-900">Submitted!</h2>
        <p className="text-slate-600 max-w-md mx-auto">
          <strong>{submittedTitle}</strong> is in — our team will call or WhatsApp
          you to confirm the details and collect photos before it goes live.
        </p>
        {conciergeLink && (
          <a
            href={conciergeLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-md transition-colors"
          >
            <MessageCircle className="h-4 w-4" />
            Speed it up — WhatsApp us your photos now
          </a>
        )}
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
