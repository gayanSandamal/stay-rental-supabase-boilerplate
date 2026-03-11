import { Suspense } from 'react';
import { HeroSection } from '@/components/hero-section';
import { TrustSignals } from '@/components/trust-signals';
import { KeyDifferentiators } from '@/components/key-differentiators';
import { HowItWorks } from '@/components/how-it-works';
import { PricingSection } from '@/components/pricing-section';
import { ForLandlordsSection } from '@/components/for-landlords-section';
import { Testimonials } from '@/components/testimonials';
import { SiteFooter } from '@/components/site-footer';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://stayrental.lk';

export const metadata = {
  alternates: {
    canonical: baseUrl,
  },
};

export default async function HomePage() {
  return (
    <>
      <main>
        <HeroSection />

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
        <PricingSection />
        <ForLandlordsSection />
        <Testimonials />
      </main>

      <SiteFooter variant="default" />
    </>
  );
}
