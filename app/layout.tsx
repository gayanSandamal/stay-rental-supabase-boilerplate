import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import { getUser } from '@/lib/db/queries';
import { SWRConfig } from 'swr';

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
    url: process.env.NEXT_PUBLIC_BASE_URL ?? 'https://stayrental.lk',
    siteName: 'Stay Rental',
    title: 'Stay Rental - Verified Mid-to-Long-Term Rentals in Sri Lanka',
    description: 'Find verified mid-to-long-term rentals in Sri Lanka. KYC-verified landlords, property visits, and fast viewing coordination.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Stay Rental - Verified Rentals in Sri Lanka',
    description: 'Find verified mid-to-long-term rentals in Sri Lanka.',
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL ?? 'https://stayrental.lk'),
};

export const viewport: Viewport = {
  maximumScale: 1
};

const manrope = Manrope({ subsets: ['latin'] });

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
