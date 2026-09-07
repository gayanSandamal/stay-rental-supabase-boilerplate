import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import { getUser } from '@/lib/db/queries';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { SWRConfig } from 'swr';
import { Suspense } from 'react';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { publisherDisplayName } from '@/lib/publisher-name';
import { jsonLdHtml } from '@/lib/seo/jsonld';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://easyrent.lk';

export const metadata: Metadata = {
  title: {
    default: 'Easy Rent - 100% Free Verified Rentals in Sri Lanka',
    template: '%s | Easy Rent',
  },
  // "Verified landlords, property visits" was false in both halves — no
  // landlord KYC exists and no property has ever been visited. This string is
  // the site-wide SEO description, so it is what Google and every social share
  // shows — which is also why the price leads it: "free" in a search snippet is
  // the reason someone clicks us instead of the paid listing site above us.
  //
  // Static export, so it cannot read the `enablePricingSection` flag (metadata
  // is evaluated at build time and the flag snapshot is per-instance). It is
  // safe anyway: it claims free listings and free browsing, both of which stay
  // true on every tier — never "the whole platform is free".
  description: 'Find mid-to-long-term rentals (1-12+ months) in Sri Lanka — 100% free of charge. Free to browse, free to contact owners, and free to list your property. Verified contact numbers and listings checked before they go live.',
  keywords: ['rental', 'Sri Lanka', 'house rent', 'apartment', 'Colombo', 'mid-term rental', 'long-term rental', 'verified rentals', 'free property listing Sri Lanka', 'list property free', 'free rental listings'],
  openGraph: {
    type: 'website',
    locale: 'en_LK',
    url: baseUrl,
    siteName: 'Easy Rent',
    title: 'Easy Rent - 100% Free Verified Rentals in Sri Lanka',
    description: 'Mid-to-long-term rentals in Sri Lanka, 100% free of charge. Free to browse, free to contact the owner, free to list your property — no fees, no commission.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Easy Rent - 100% Free Verified Rentals in Sri Lanka',
    description: 'Mid-to-long-term rentals in Sri Lanka, 100% free of charge. Free to browse, free to contact, free to list.',
  },
  metadataBase: new URL(baseUrl),
  /*
   * Search Console / Bing Webmaster ownership.
   *
   * Server-rendered metadata, so these are plain env vars — deliberately NOT
   * NEXT_PUBLIC_*. They are not secrets (the tag is public in the HTML either
   * way), but nothing here needs to reach the client bundle.
   *
   * Both fall back to undefined, which Next omits entirely — an unset var
   * renders no tag rather than an empty one that fails verification.
   */
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
    other: process.env.BING_SITE_VERIFICATION
      ? { 'msvalidate.01': process.env.BING_SITE_VERIFICATION }
      : undefined,
  },
  alternates: {
    languages: {
      'en-LK': baseUrl,
      'x-default': baseUrl,
    },
  },
};

export const viewport: Viewport = {
  maximumScale: 1,
  themeColor: '#062C2B',
};

const manrope = Manrope({ subsets: ['latin'] });

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Easy Rent',
  legalName: 'Easy Rent (Pvt) Ltd',
  url: baseUrl,
  description: 'Sri Lanka\'s trusted platform for verified mid-to-long-term rentals — 100% free of charge to browse, to contact owners, and to list a property.',
  contactPoint: {
    '@type': 'ContactPoint',
    email: 'hello@easyrent.lk',
    contactType: 'customer service',
    areaServed: 'LK',
  },
  sameAs: [],
};

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Easy Rent',
  url: baseUrl,
  description: 'Find verified mid-to-long-term rentals in Sri Lanka, 100% free of charge.',
  publisher: {
    '@type': 'Organization',
    name: 'Easy Rent',
  },
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${baseUrl}/listings?search={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
};

export default async function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  // Refresh the per-instance feature-flag snapshot from the DB (TTL-cached) so
  // server-rendered pages and downstream isFeatureEnabled() calls see overrides.
  await loadFeatureFlags();

  return (
    <html
      lang="en"
      className={`bg-[#F7F4ED] dark:bg-[#0d1917] text-[#1F2933] dark:text-[#f0ede5] ${manrope.className}`}
    >
      <body className="min-h-[100dvh] bg-[#F7F4ED]">
        {/*
          jsonLdHtml, not JSON.stringify: a bare stringify leaves `<` intact
          inside a <script> body, so any text that reaches these blocks could
          close the tag early. See lib/seo/jsonld.ts.
        */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdHtml(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdHtml(websiteJsonLd) }}
        />
        <SWRConfig
          value={{
            fallback: {
              // We do NOT await here
              // Only components that read this data will suspend
              '/api/user': getUser(),
            }
          }}
        >
          {/*
            Rendered above everything, on every page. While impersonating, the
            admin is (to every role check in the app) the subject — so they have
            no back-office access, and the way out cannot live behind an
            admin-only route. This banner is both the reminder and the exit.
          */}
          <Suspense fallback={null}>
            <ImpersonationBannerSlot />
          </Suspense>
          {children}
        </SWRConfig>
        {/*
          Speed Insights reports FIELD Core Web Vitals — the only CWV signal
          that feeds ranking. Lab scores from a local Lighthouse run do not.
          Both components render nothing and ship no blocking script.
        */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

/**
 * Reads the impersonation state below a Suspense boundary so the root layout
 * itself never awaits — an await here would postpone PPR at the root for every
 * page in the app. See the performance notes in CLAUDE.md.
 */
async function ImpersonationBannerSlot() {
  const user = await getUser();
  if (!user?.impersonatedBy) return null;
  return (
    <ImpersonationBanner
      subjectLabel={publisherDisplayName({ name: user.name, email: user.email })}
      actorLabel={publisherDisplayName({
        name: user.impersonatedBy.name,
        email: user.impersonatedBy.email,
      })}
      expiresAt={user.impersonationExpiresAt?.toISOString() ?? null}
    />
  );
}
