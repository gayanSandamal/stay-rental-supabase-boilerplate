import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import { getUser } from '@/lib/db/queries';
import { SWRConfig } from 'swr';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://stayrental.lk';

export const metadata: Metadata = {
  title: {
    default: 'Stay Rental - Verified Mid-to-Long-Term Rentals in Sri Lanka',
    template: '%s | Stay Rental',
  },
  description: 'Find verified mid-to-long-term rentals (1-12+ months) in Sri Lanka. KYC-verified landlords, property visits, and fast viewing coordination.',
  keywords: ['rental', 'Sri Lanka', 'house rent', 'apartment', 'Colombo', 'mid-term rental', 'long-term rental', 'verified rentals'],
  openGraph: {
    type: 'website',
    locale: 'en_LK',
    url: baseUrl,
    siteName: 'Stay Rental',
    title: 'Stay Rental - Verified Mid-to-Long-Term Rentals in Sri Lanka',
    description: 'Find verified mid-to-long-term rentals in Sri Lanka. KYC-verified landlords, property visits, and fast viewing coordination.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Stay Rental - Verified Rentals in Sri Lanka',
    description: 'Find verified mid-to-long-term rentals in Sri Lanka.',
  },
  metadataBase: new URL(baseUrl),
};

export const viewport: Viewport = {
  maximumScale: 1
};

const manrope = Manrope({ subsets: ['latin'] });

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Stay Rental',
  legalName: 'Stay Rental (Pvt) Ltd',
  url: baseUrl,
  description: 'Sri Lanka\'s trusted platform for verified mid-to-long-term rentals.',
  contactPoint: {
    '@type': 'ContactPoint',
    email: 'hello@stayrental.lk',
    contactType: 'customer service',
    areaServed: 'LK',
  },
  sameAs: [],
};

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Stay Rental',
  url: baseUrl,
  description: 'Find verified mid-to-long-term rentals in Sri Lanka.',
  publisher: {
    '@type': 'Organization',
    name: 'Stay Rental',
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

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`bg-[#F7F4ED] dark:bg-[#0d1917] text-[#1F2933] dark:text-[#f0ede5] ${manrope.className}`}
    >
      <body className="min-h-[100dvh] bg-[#F7F4ED]">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
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
          {children}
        </SWRConfig>
      </body>
    </html>
  );
}
