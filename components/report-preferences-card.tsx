'use client';

import useSWR from 'swr';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, Check, Loader2, MessageCircle, Lock } from 'lucide-react';
import Link from 'next/link';
import { useFeatureFlag } from '@/lib/hooks/use-feature-flags';

type Prefs = {
  frequency: 'off' | 'weekly' | 'daily';
  storedFrequency: string;
  canChooseDaily: boolean;
  hasWhatsApp: boolean;
  enabled: boolean;
  deliverable: boolean;
  lastSentAt: string | null;
};

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null));

const OPTIONS: Array<{ value: Prefs['frequency']; label: string; hint: string; paid?: boolean }> = [
  { value: 'weekly', label: 'Weekly', hint: 'One summary every 7 days.' },
  {
    value: 'daily',
    label: 'Daily',
    hint: 'A summary every morning.',
    paid: true,
  },
  { value: 'off', label: 'Off', hint: 'No scheduled reports.' },
];

/**
 * Where a landlord chooses how often their performance report arrives.
 *
 * Lives in general settings rather than on the analytics page on purpose: the
 * analytics page is gated to paid tiers, and the WEEKLY report is for everyone.
 * Putting the control behind the paywall would hide the free half of the
 * feature from exactly the landlords it exists to retain.
 *
 * The card renders nothing at all when the landlord has no verified WhatsApp
 * number, because there is no honest thing to say — offering a cadence for a
 * message that can never be delivered is worse than staying quiet.
 */
export function ReportPreferencesCard() {
  const flagEnabled = useFeatureFlag('enableLandlordReports');
  const { data, mutate, isLoading } = useSWR<Prefs | null>('/api/reports/preferences', fetcher);
  const [saving, setSaving] = useState<Prefs['frequency'] | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!flagEnabled || isLoading || !data || !data.hasWhatsApp) return null;

  const pricingHref = '/#pricing';

  async function choose(frequency: Prefs['frequency']) {
    setSaving(frequency);
    setError(null);
    try {
      const res = await fetch('/api/reports/preferences', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ frequency }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Could not save');
      mutate(await res.json(), { revalidate: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Performance reports
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-600 flex items-start gap-2">
          <MessageCircle className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
          <span>
            We send a short summary to your WhatsApp — views, how you compare, and what to
            fix. You can also reply <strong>STOP</strong> to any report to turn them off.
          </span>
        </p>

        <div className="space-y-2">
          {OPTIONS.map((option) => {
            const locked = Boolean(option.paid) && !data.canChooseDaily;
            const selected = data.storedFrequency === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => choose(option.value)}
                disabled={saving !== null}
                className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                  selected
                    ? 'border-teal-600 bg-teal-50'
                    : 'border-slate-200 hover:border-slate-300'
                } ${saving !== null ? 'opacity-60' : ''}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span>
                    <span className="flex items-center gap-2 font-medium text-sm text-gray-900">
                      {option.label}
                      {locked && <Lock className="h-3 w-3 text-slate-400" />}
                    </span>
                    <span className="block text-xs text-slate-500 mt-0.5">{option.hint}</span>
                  </span>
                  {saving === option.value ? (
                    <Loader2 className="h-4 w-4 animate-spin text-teal-600 shrink-0" />
                  ) : (
                    selected && <Check className="h-4 w-4 text-teal-600 shrink-0" />
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/*
          A free landlord who picked Daily keeps that choice stored — it applies
          the moment they upgrade — but must not be left believing daily reports
          are arriving. Say plainly what is actually being sent.
        */}
        {data.storedFrequency === 'daily' && !data.canChooseDaily && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-md px-3 py-2">
            Daily reports are part of the paid plans. We&apos;ll keep sending you the weekly
            summary, and switch you to daily as soon as you upgrade.{' '}
            <Link href={pricingHref} className="font-medium underline">
              See plans
            </Link>
          </p>
        )}

        {/*
          The feature can be on while delivery is impossible (no approved Meta
          template yet). Telling a landlord "weekly report on" in that state is a
          promise the platform cannot keep.
        */}
        {data.storedFrequency !== 'off' && !data.deliverable && (
          <p className="text-xs text-slate-500">
            WhatsApp reports aren&apos;t switched on yet — we&apos;ll start sending as soon as
            they are. Your summary is always in your notifications.
          </p>
        )}

        {data.lastSentAt && (
          <p className="text-xs text-slate-500">
            Last report sent {new Date(data.lastSentAt).toLocaleDateString()}
          </p>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}
