import Link from 'next/link';
import { ScrollReveal } from './scroll-reveal';
import { Shield, Users, LineChart, ArrowRight } from 'lucide-react';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { WhatsAppConciergeButton } from './whatsapp-concierge-button';
import { FreeBadge } from './free-badge';
import { FREE_BADGE } from '@/lib/free-copy';

export function ForLandlordsSection() {
  const pricingEnabled = isFeatureEnabled('enablePricingSection');
  const conciergeEnabled = isFeatureEnabled('enableWhatsAppConcierge');
  // Advertise the view counts only while the flag that actually renders them is
  // on. A card promising a graph that the dashboard no longer draws is the same
  // broken promise as the property-visit claim this section already dropped.
  const viewCountsEnabled = isFeatureEnabled('showViewCountsToAllTiers');
  return (
    <section className="py-20 lg:py-28 bg-[#F7F4ED] relative overflow-hidden">
      <div className="absolute inset-0 dot-pattern opacity-30 pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <div className="text-center mb-12">
            <span className="inline-block px-3 py-1 text-xs font-semibold tracking-widest text-teal-800 bg-teal-50 border border-teal-200 rounded-full uppercase mb-4">
              For Landlords
            </span>
            <h2 className="text-4xl sm:text-5xl font-extrabold text-slate-900 leading-tight">
              List Your Property With{' '}
              <span className="gradient-text">Easy Rent</span>
            </h2>
            {!pricingEnabled && (
              <div className="mt-5 flex justify-center">
                <FreeBadge label={FREE_BADGE} />
              </div>
            )}
            <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
              {pricingEnabled
                ? 'Post unlimited properties free. Need more visibility? Boost from LKR 250.'
                : 'Post unlimited properties, totally free of charge. No listing fee, no commission, no subscription — we never ask you for money.'}
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal stagger>
          <div
            className={`grid gap-6 mb-12 ${
              viewCountsEnabled ? 'md:grid-cols-3' : 'md:grid-cols-2'
            }`}
          >
            <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
              <Shield className="h-10 w-10 text-teal-600 mb-4" />
              <h3 className="text-lg font-bold text-slate-900 mb-2">
                Direct Tenant Contact
              </h3>
              <p className="text-slate-600 text-sm">
                Your contact numbers are shown on listings. Tenants call or WhatsApp you
                directly—no middleman.
              </p>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
              <Users className="h-10 w-10 text-teal-600 mb-4" />
              <h3 className="text-lg font-bold text-slate-900 mb-2">
                Ops Verification
              </h3>
              {/* "and optionally visits the property" removed — no property
                  visit has ever happened, and nothing records one. */}
              <p className="text-slate-600 text-sm">
                Our team reviews your listing and verifies your contact number
                before it goes live. You handle tenant contact directly.
              </p>
            </div>
            {viewCountsEnabled && (
              <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
                <LineChart className="h-10 w-10 text-teal-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-2">
                  See How It’s Doing
                </h3>
                {/*
                  * Deliberately modest, and deliberately not "see who viewed
                  * your listing": the visitor hash rotates daily and cannot
                  * identify anyone. It promises a count, which is what we have.
                  * The deeper comparisons are paid, so they are named only when
                  * paid visibility is actually on sale.
                  */}
                <p className="text-slate-600 text-sm">
                  Every listing shows a 30-day view graph and a 7-day total — on every
                  plan, including free. Counts start the day you publish.
                  {pricingEnabled &&
                    ' Rent comparisons and contact stats come with the paid plans.'}
                </p>
              </div>
            )}
          </div>
        </ScrollReveal>

        <ScrollReveal>
          <div className="flex flex-wrap justify-center items-center gap-4">
            <Link
              href="/list-your-property"
              className="btn-amber-gradient inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-white font-semibold text-base shadow-xl shadow-amber-800/25 hover:opacity-95 transition-opacity"
            >
              {pricingEnabled ? 'Learn More & Get Started' : 'Start Listing — Free of Charge'}
              <ArrowRight className="h-4 w-4" />
            </Link>
            {conciergeEnabled && (
              <WhatsAppConciergeButton
                variant="light"
                source="from homepage landlord section"
                label="WhatsApp us 6 photos — we list it for you"
                className="px-8 py-3.5 rounded-xl text-base"
              />
            )}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
