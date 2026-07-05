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

// Homepage fetches listings; must be dynamic so build does not require DB schema to be migrated
export const dynamic = 'force-dynamic';

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
