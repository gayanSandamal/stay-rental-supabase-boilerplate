import { Suspense } from 'react';
import { HeroSection } from '@/components/hero-section';
import { TrustSignals } from '@/components/trust-signals';
import { KeyDifferentiators } from '@/components/key-differentiators';
import { HowItWorks } from '@/components/how-it-works';
import { PricingSection } from '@/components/pricing-section';
import { ForLandlordsSection } from '@/components/for-landlords-section';
import { Testimonials } from '@/components/testimonials';
import { FoundingLandlordCta } from '@/components/founding-landlord-cta';
import { SiteFooter } from '@/components/site-footer';
import { isFeatureEnabled } from '@/lib/feature-flags';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://easyrent.lk';

/*
 * Revalidated, not dynamic — and 30s is not arbitrary: it is exactly
 * `CACHE_TTL_MS` in lib/feature-flags-store.ts.
 *
 * This page reads three feature flags, and CLAUDE.md said flag-gated pages must
 * be `force-dynamic` "so toggles take effect without a rebuild". But the flag
 * snapshot is already per-instance and 30s-stale by design, so `force-dynamic`
 * never bought an instant toggle — it bought the same 30s staleness while ALSO
 * opting the page out of PPR. The build showed the cost: a 0-byte static shell,
 * so a click had nothing to paint and blocked on a full server render.
 *
 * `revalidate = 30` gives identical flag freshness and gets the shell back.
 *
 * The old comment claimed the export kept the build from needing a migrated DB.
 * That was never what it did: a plain DB read does not force dynamic rendering
 * (only cookies/headers/searchParams do), and 16 other pages already prerender
 * against this same root layout, which awaits loadFeatureFlags().
 */
export const revalidate = 30;

export const metadata = {
  alternates: {
    canonical: baseUrl,
  },
};

export default async function HomePage() {
  // Founding-stage copy: honest claims only, until real usage backs the
  // social-proof numbers (toggle in Back Office → Settings).
  const foundingMode = isFeatureEnabled('showFoundingStageCopy');

  return (
    <>
      <main>
        <HeroSection foundingMode={foundingMode} />

        <Suspense fallback={
          <div className="py-14 bg-white">
            <div className="max-w-7xl mx-auto px-4 grid grid-cols-2 lg:grid-cols-4 gap-5">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-slate-100 rounded-2xl animate-pulse" />
              ))}
            </div>
          </div>
        }>
          <TrustSignals />
        </Suspense>

        <KeyDifferentiators />
        <HowItWorks />
        {isFeatureEnabled('enablePricingSection') && <PricingSection />}
        <ForLandlordsSection />
        {foundingMode ? <FoundingLandlordCta /> : <Testimonials />}
      </main>

      <SiteFooter variant="default" />
    </>
  );
}
