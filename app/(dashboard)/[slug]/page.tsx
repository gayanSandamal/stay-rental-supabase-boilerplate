import { getLandlordByProfileSlugOrPublicId } from '@/lib/db/queries';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Building2, Home, MapPin } from 'lucide-react';
import { ListingCard } from '@/components/listing-card';
import type { Metadata } from 'next';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://easyrent.lk';

const RESERVED_SLUGS = new Set([
  'listings',
  'sign-in',
  'sign-up',
  'dashboard',
  'list-your-property',
  'how-to-use',
  'privacy-policy',
  'terms-of-service',
  'forgot-password',
  'reset-password',
  'terminal',
  'back-office',
]);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }> | { slug: string };
}): Promise<Metadata> {
  const resolvedParams = params instanceof Promise ? await params : params;
  const slug = resolvedParams.slug;
  if (!slug || RESERVED_SLUGS.has(slug)) return {};

  const landlord = await getLandlordByProfileSlugOrPublicId(slug);
  if (!landlord) return {};

  const name = landlord.user?.name || landlord.user?.email || 'Landlord';
  const listingCount = landlord.listings?.length ?? 0;
  const description = `${name}'s portfolio on Easy Rent. ${listingCount} active rental${listingCount !== 1 ? 's' : ''} in Sri Lanka.`;

  const profileUrl = `${baseUrl}/${slug}`;

  return {
    title: `${name} | Landlord Portfolio`,
    description,
    alternates: {
      canonical: profileUrl,
    },
    openGraph: {
      title: `${name} | Landlord Portfolio | Easy Rent`,
      description,
      type: 'profile',
      url: profileUrl,
      siteName: 'Easy Rent',
    },
    twitter: {
      card: 'summary',
      title: `${name} | Landlord Portfolio`,
      description,
    },
  };
}

export default async function LandlordProfilePage({
  params,
}: {
  params: Promise<{ slug: string }> | { slug: string };
}) {
  const resolvedParams = params instanceof Promise ? await params : params;
  const slug = resolvedParams.slug;

  if (!slug || RESERVED_SLUGS.has(slug)) {
    notFound();
  }

  const landlord = await getLandlordByProfileSlugOrPublicId(slug);
  if (!landlord) {
    notFound();
  }

  const name = landlord.user?.name || landlord.user?.email || 'Landlord';
  const listings = landlord.listings ?? [];

  return (
    <div className="min-h-screen bg-[#F7F4ED]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-600 to-teal-800 flex items-center justify-center shadow-lg">
              <Building2 className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{name}</h1>
              <p className="text-slate-600 text-sm mt-0.5">
                Landlord portfolio on Easy Rent
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
            <span>{listings.length} active listing{listings.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Listings grid */}
        {listings.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                showPublisher={false}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-12 text-center">
            <Home className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 font-medium">No active listings yet</p>
            <p className="text-slate-500 text-sm mt-1">
              Check back later for new properties from {name}.
            </p>
            <Link
              href="/listings"
              className="inline-flex items-center gap-2 mt-6 text-teal-700 font-semibold hover:underline"
            >
              <MapPin className="h-4 w-4" />
              Browse all listings
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
