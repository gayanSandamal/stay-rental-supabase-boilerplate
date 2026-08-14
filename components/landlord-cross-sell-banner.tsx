'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Home, X, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFeatureFlag } from '@/lib/hooks/use-feature-flags';
import { WhatsAppConciergeButton } from './whatsapp-concierge-button';

const DISMISS_KEY = 'er-landlord-crosssell-dismissed';

/**
 * Tenant→landlord cross-sell: a slim dismissible nudge shown to signed-in
 * tenants on /listings. Dismissal persists in localStorage so it never nags.
 * Renders only after mount to avoid a hydration flash.
 */
export function LandlordCrossSellBanner() {
  const [visible, setVisible] = useState(false);
  const quickListEnabled = useFeatureFlag('enableQuickList');
  const conciergeEnabled = useFeatureFlag('enableWhatsAppConcierge');

  useEffect(() => {
    if (!localStorage.getItem(DISMISS_KEY)) setVisible(true);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  };

  if (!visible) return null;

  const listHref = quickListEnabled
    ? '/dashboard/listings/new?mode=quick'
    : '/list-your-property';

  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <Home className="h-5 w-5 flex-shrink-0 text-amber-700 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm text-amber-900 mb-2">
          <strong>Also have a property to rent out?</strong>{' '}
          {quickListEnabled
            ? 'List it free in 60 seconds'
            : 'List it free'}
          {conciergeEnabled ? ' — or WhatsApp us 6 photos and we\'ll do it for you.' : '.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={listHref}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors"
          >
            {quickListEnabled ? 'List in 60 seconds' : 'List your property'}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          {conciergeEnabled && (
            <WhatsAppConciergeButton
              variant="compact"
              source="from tenant cross-sell banner"
              label="WhatsApp us your photos"
            />
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 flex-shrink-0 text-amber-700 hover:bg-amber-100 hover:text-amber-900"
        onClick={dismiss}
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
