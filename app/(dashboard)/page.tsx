import { Suspense } from 'react';
import { HeroSection } from '@/components/hero-section';
import { TrustSignals } from '@/components/trust-signals';
import { KeyDifferentiators } from '@/components/key-differentiators';
import { HowItWorks } from '@/components/how-it-works';
import { PricingSection } from '@/components/pricing-section';
import { FreePromiseSection } from '@/components/free-promise-section';
import { ForLandlordsSection } from '@/components/for-landlords-section';
import { Testimonials } from '@/components/testimonials';
import { FoundingLandlordCta } from '@/components/founding-landlord-cta';
import { SiteFooter } from '@/components/site-footer';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { isPlatformFullyFree } from '@/lib/free-copy';
import type { Metadata } from 'next';

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

/*
 * The homepage carried ONLY a canonical and inherited its title, description
 * and OpenGraph from the root layout — so the most valuable page on the site
 * competed for "rent in Sri Lanka" with the same generic snippet every other
 * page showed.
 *
 * `title.absolute` bypasses the root `'%s | Easy Rent'` template: the brand is
 * already in the string, and letting the template run would render
 * "… | Easy Rent | Easy Rent".
 *
 * Static export, so it cannot read `enablePricingSection` (metadata is
 * evaluated without the per-instance flag snapshot). Every claim here is
 * therefore scoped to things that are free on EVERY tier — free to browse,
 * free to contact, free to list — never "the whole platform is free". See
 * lib/free-copy.ts for why that distinction is load-bearing.
 */
export const metadata: Metadata = {
  title: {
    absolute: 'Houses & Apartments for Rent in Sri Lanka | Easy Rent',
  },
  description:
    'Browse verified mid-to-long-term rentals (1–12+ months) across Sri Lanka. Every contact number is verified and you deal directly with the owner — free to browse, free to contact, free to list. Filter by power backup, water source, fibre and deposit months.',
  alternates: {
    canonical: baseUrl,
  },
  openGraph: {
    type: 'website',
    url: baseUrl,
    siteName: 'Easy Rent',
    locale: 'en_LK',
    title: 'Houses & Apartments for Rent in Sri Lanka | Easy Rent',
    description:
      'Verified mid-to-long-term rentals across Sri Lanka. Deal directly with the owner — free to browse, free to contact, free to list.',
    /*
     * `images` MUST be listed explicitly here.
     *
     * app/opengraph-image.tsx is injected automatically only for routes that do
     * not declare their own `openGraph` — and metadata merges by top-level key,
     * so declaring this block at all replaces the parent's wholesale. Omitting
     * images therefore silently stripped og:image from the homepage, which is
     * the single most-shared URL on the site. e2e/seo.spec.ts B3 caught it.
     */
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Easy Rent' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Houses & Apartments for Rent in Sri Lanka | Easy Rent',
    description:
      'Verified mid-to-long-term rentals across Sri Lanka. Deal directly with the owner — no fees, no commission.',
    images: ['/opengraph-image'],
  },
};

export default async function HomePage() {
  // Founding-stage copy: honest claims only, until real usage backs the
  // social-proof numbers (toggle in Back Office → Settings).
  const foundingMode = isFeatureEnabled('showFoundingStageCopy');
  // The hero is a client component, so it cannot read the pricing flag itself.
  const fullyFree = isPlatformFullyFree();

  return (
    <>
      <main>
        <HeroSection foundingMode={foundingMode} fullyFree={fullyFree} />

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
        {/* One or the other, never both — a "100% free of charge" band sitting
            above an LKR 500 Featured card is the worst thing a pricing page can
            do. `fullyFree` is the negation of the same flag. */}
        {fullyFree ? <FreePromiseSection /> : <PricingSection />}
        <ForLandlordsSection />
        {foundingMode ? <FoundingLandlordCta /> : <Testimonials />}
      </main>

      <SiteFooter variant="default" />
    </>
  );
}
