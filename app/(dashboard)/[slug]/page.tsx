import { getLandlordByProfileSlugOrPublicId } from '@/lib/db/queries';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Building2, Home, MapPin } from 'lucide-react';
import { ListingCard } from '@/components/listing-card';
import type { Metadata } from 'next';
import { isReservedSlug } from '@/lib/reserved-slugs';
import { publisherDisplayName } from '@/lib/publisher-name';
import { jsonLdHtml, realEstateAgent, breadcrumbList } from '@/lib/seo/jsonld';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://easyrent.lk';


export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }> | { slug: string };
}): Promise<Metadata> {
  const resolvedParams = params instanceof Promise ? await params : params;
  const slug = resolvedParams.slug;
  if (!slug || isReservedSlug(slug)) return { robots: { index: false, follow: false } };

  const landlord = await getLandlordByProfileSlugOrPublicId(slug);
  if (!landlord) return { robots: { index: false, follow: false } };

  const name = publisherDisplayName({
    name: landlord.user?.name,
    email: landlord.user?.email,
  });
  const listingCount = landlord.listings?.length ?? 0;
  const description = `${name}'s portfolio on Easy Rent. ${listingCount} active rental${listingCount !== 1 ? 's' : ''} in Sri Lanka.`;

  /*
   * This page answers to TWO URLs — the UUID publicId and, once claimed, the
   * vanity slug — and each used to declare itself canonical, so every landlord
   * with a slug was a duplicate-content pair competing with itself.
   *
   * The vanity slug wins when one exists: it is the URL we print, share and
   * link, and it survives even though `profileSlug` is write-once. The UUID
   * form then points at it instead of claiming its own indexation.
   */
  const canonicalSlug = landlord.profileSlug ?? slug;
  const profileUrl = `${baseUrl}/${canonicalSlug}`;

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
      locale: 'en_LK',
      images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Easy Rent' }],
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

  if (!slug || isReservedSlug(slug)) {
    notFound();
  }

  const landlord = await getLandlordByProfileSlugOrPublicId(slug);
  if (!landlord) {
    notFound();
  }

  /*
   * `name || email` printed a nameless landlord's real address on a public
   * page, and for a WhatsApp-intake landlord it would have printed the
   * synthetic wa-<hash>@wa.easyrent.lk identifier. publisherDisplayName is the
   * one sanctioned way to render a publisher — see lib/publisher-name.ts.
   */
  const name = publisherDisplayName({
    name: landlord.user?.name,
    email: landlord.user?.email,
  });
  const listings = landlord.listings ?? [];
  const canonicalSlug = landlord.profileSlug ?? slug;

  const agentJsonLd = realEstateAgent({
    name,
    path: `/${canonicalSlug}`,
    listingCount: listings.length,
  });
  const breadcrumbJsonLd = breadcrumbList([
    { name: 'Home', path: '/' },
    { name, path: `/${canonicalSlug}` },
  ]);

  return (
    <div className="min-h-screen bg-[#F7F4ED]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(agentJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(breadcrumbJsonLd) }}
      />
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
