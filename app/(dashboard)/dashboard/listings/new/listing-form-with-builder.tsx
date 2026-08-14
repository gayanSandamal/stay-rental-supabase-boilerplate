'use client';

import { FormBuilder } from '@/components/form-builder';
import type { FormFieldConfig } from '@/components/form-field';
import { formConfigs } from '@/lib/forms';
import { useFeatureFlag } from '@/lib/hooks/use-feature-flags';
import { cn } from '@/lib/utils';
import { ArrowRight, CheckCircle2, ClipboardList, ImagePlus, Zap } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export type ListingFormMode = 'quick' | 'full';

interface ListingFormWithBuilderProps {
  landlordId: number;
  businessAccountId?: number | null;
  createdBy?: number;
  /** Resolved server-side from `?mode=` and the `enableQuickList` flag. */
  initialMode: ListingFormMode;
  quickListEnabled: boolean;
}

/**
 * The single create-listing form. `mode` chooses how much of it is shown:
 *
 * - `quick` — the 60-second form: six fields, ops enriches the rest on the
 *   verification call.
 * - `full`  — every section, photos included.
 *
 * Both modes are backed by ONE FormBuilder instance on purpose. The six quick
 * fields are an exact subset of the full form's field names, so switching mode
 * only changes which fields are rendered and validated — nothing the landlord
 * typed is lost in either direction, and anything already filled in full mode
 * is still submitted from quick mode.
 */
export function ListingFormWithBuilder({
  landlordId,
  businessAccountId,
  createdBy,
  initialMode,
  quickListEnabled,
}: ListingFormWithBuilderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [mode, setMode] = useState<ListingFormMode>(initialMode);
  const [submitted, setSubmitted] = useState<{ id: number; title: string } | null>(
    null
  );
  const pricingEnabled = useFeatureFlag('enablePricingSection');

  // Follow the URL when a soft navigation lands here with a different `?mode=`
  // and React reuses this instance, so the form can never disagree with the
  // address bar. Toggling already re-renders the page with a matching
  // `initialMode`, so this never fights `switchMode`.
  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const switchMode = (next: ListingFormMode) => {
    if (next === mode) return;
    setMode(next);
    // `replace`, not `push`: with push, Back would un-toggle the form instead
    // of leaving the page. Both modes stay shareable as explicit URLs.
    router.replace(`${pathname}?mode=${next}`, { scroll: false });
  };

  const handleSubmit = async (data: Record<string, any>) => {
    const response = await fetch('/api/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        landlordId,
        businessAccountId: businessAccountId || null,
        createdBy: createdBy || null,
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

    const result = await response.json();

    if (mode === 'quick') {
      // In-place success panel instead of a redirect — we want the photo
      // follow-up CTA in front of the landlord while they're engaged.
      setSubmitted({
        id: result.listing.id,
        title: String(data.title ?? 'your listing'),
      });
      return;
    }

    router.push('/dashboard/listings');
  };

  const handleCancel = () => {
    router.back();
  };

  if (submitted) {
    // NB: no WhatsApp photo follow-up here — the concierge number feeds the
    // automated intake pipeline, which has no attach-photos-to-existing-listing
    // path; photos for a form-created listing go in via the dashboard.
    return (
      <div className="max-w-2xl mx-auto w-full">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center space-y-5">
          <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
          <h2 className="text-2xl font-extrabold text-slate-900">Submitted!</h2>
          <p className="text-slate-600 max-w-md mx-auto">
            <strong>{submitted.title}</strong> is in — add photos now so it goes
            live faster. Our team reviews it shortly.
          </p>
          <Link
            href={`/dashboard/listings/${submitted.id}/edit`}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-md transition-colors"
          >
            <ImagePlus className="h-4 w-4" />
            Add photos to this listing
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
      </div>
    );
  }

  const baseConfig =
    mode === 'quick' ? formConfigs.quickList : formConfigs.listing;

  // Hide the "Exclusive (Premium renters only)" visibility fields while paid
  // visibility is off — the perk isn't purchasable then, and an exclusive
  // listing would be invisible to every renter.
  const modeFields: FormFieldConfig[] =
    mode === 'quick'
      ? formConfigs.quickList.fields
      : formConfigs.listing.fields.filter(
          (field) =>
            pricingEnabled || !['visibilitySection', 'exclusive'].includes(field.name)
        );

  const config = {
    ...baseConfig,
    // Contact numbers are business-account scoped in both modes.
    fields: modeFields.map((field) =>
      field.type === 'contact-numbers'
        ? { ...field, businessAccountId: businessAccountId || null }
        : field
    ),
    onSubmit: handleSubmit,
    onCancel: handleCancel,
  };

  return (
    <div className={cn('w-full', mode === 'quick' && 'max-w-2xl mx-auto')}>
      {quickListEnabled && (
        <ListingModeSwitch mode={mode} onSwitch={switchMode} />
      )}

      {/* No `key` here on purpose — one instance across the switch is what
          preserves everything already typed. */}
      <FormBuilder config={config} />

      {quickListEnabled && (
        <p className="mt-4 text-sm text-slate-600">
          {mode === 'quick' ? (
            <>
              Have photos and full details ready?{' '}
              <button
                type="button"
                onClick={() => switchMode('full')}
                className="text-teal-700 font-medium hover:underline"
              >
                Switch to the full form →
              </button>
            </>
          ) : (
            <>
              In a hurry?{' '}
              <button
                type="button"
                onClick={() => switchMode('quick')}
                className="text-teal-700 font-medium hover:underline"
              >
                Use the 60-second form →
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}

function ListingModeSwitch({
  mode,
  onSwitch,
}: {
  mode: ListingFormMode;
  onSwitch: (next: ListingFormMode) => void;
}) {
  const options: Array<{
    value: ListingFormMode;
    label: string;
    icon: typeof Zap;
  }> = [
    { value: 'quick', label: 'Quick (60 sec)', icon: Zap },
    { value: 'full', label: 'Full details', icon: ClipboardList },
  ];

  return (
    <div className="mb-6">
      <div
        role="group"
        aria-label="Listing form depth"
        className="inline-flex rounded-full border border-slate-200 bg-slate-100 p-1"
      >
        {options.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => onSwitch(value)}
            className={cn(
              'inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold transition-colors',
              mode === value
                ? 'bg-white text-teal-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-slate-600">
        {mode === 'quick'
          ? 'Six fields and you’re done — we confirm the details and photos with you before it goes live. Your answers are kept if you switch.'
          : 'Every detail up front, photos included. Your answers are kept if you switch.'}
      </p>
    </div>
  );
}
