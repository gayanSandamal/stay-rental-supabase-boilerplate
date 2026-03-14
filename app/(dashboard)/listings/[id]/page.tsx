import { getListingById, getUser, getUserWithLandlord } from '@/lib/db/queries';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  MapPin,
  Bed,
  Bath,
  Zap,
  Droplet,
  Wifi,
  Shield,
  Calendar,
  Home,
  Building2,
  User,
  Phone,
  MessageCircle,
  ChevronRight,
} from 'lucide-react';
import { PropertyImagesGallery } from '@/components/property-images-gallery';
import { SocialShare } from '@/components/social-share';
import { SimilarListings } from '@/components/similar-listings';
import { db } from '@/lib/db/drizzle';
import { businessAccountMembers, businessAccounts, users, landlords } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import type { Metadata } from 'next';
import { getFirstListingPhoto } from '@/lib/seo';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://stayrental.lk';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}): Promise<Metadata> {
  const resolvedParams = params instanceof Promise ? await params : params;
  const listingId = Number(resolvedParams.id);
  if (isNaN(listingId) || listingId <= 0) return {};

  const listing = await getListingById(listingId);
  if (!listing || listing.status !== 'active') return {};

  const description = `${listing.bedrooms} bed rental in ${listing.city}${listing.district ? `, ${listing.district}` : ''} - LKR ${Number(listing.rentPerMonth).toLocaleString()}/month. ${listing.description?.slice(0, 140) ?? ''}`;
  const listingUrl = `${baseUrl}/listings/${listing.id}`;
  const firstPhoto = getFirstListingPhoto(listing.photos);

  return {
    title: listing.title,
    description,
    alternates: {
      canonical: listingUrl,
    },
    openGraph: {
      title: listing.title,
      description,
      type: 'website',
      url: listingUrl,
      siteName: 'Stay Rental',
      images: firstPhoto
        ? [{ url: firstPhoto, width: 1200, height: 630, alt: listing.title }]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: listing.title,
      description,
      images: firstPhoto ? [firstPhoto] : undefined,
    },
  };
}

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  // Handle both Promise and direct params (Next.js 15 compatibility)
  const resolvedParams = params instanceof Promise ? await params : params;
  const listingId = Number(resolvedParams.id);

  // Validate that the ID is a valid number
  if (isNaN(listingId) || listingId <= 0) {
    notFound();
  }

  const [listing, user] = await Promise.all([
    getListingById(listingId),
    getUser(),
  ]);

  if (!listing) {
    notFound();
  }

  // Active listings are public — anyone can view them.
  // Non-active listings require authentication + ownership.
  if (listing.status !== 'active') {
    if (!user) {
      notFound();
    }

    let canView = false;

    if (user.role === 'admin' || user.role === 'ops') {
      canView = true;
    } else {
      const userWithLandlord = await getUserWithLandlord(user.id);
      if (userWithLandlord?.landlord && userWithLandlord.landlord.id === listing.landlordId) {
        canView = true;
      } else {
        try {
          const member = await db.query.businessAccountMembers.findFirst({
            where: and(
              eq(businessAccountMembers.userId, user.id),
              eq(businessAccountMembers.isActive, true)
            ),
          });
          
          if (member && listing.businessAccountId === member.businessAccountId) {
            canView = true;
          } else if (listing.createdBy === user.id) {
            canView = true;
          }
        } catch (error: any) {
          if (listing.createdBy === user.id) {
            canView = true;
          }
        }
      }
    }

    if (!canView) {
      notFound();
    }
  }

  const isLoggedIn = !!user;

  // Fetch publisher information
  let publisherName = 'Unknown';
  let publisherType: 'individual' | 'business' = 'individual';

  if (listing.businessAccountId) {
    try {
      const businessAccount = await db.query.businessAccounts.findFirst({
        where: eq(businessAccounts.id, listing.businessAccountId),
      });
      
      if (businessAccount) {
        publisherType = 'business';
        publisherName = businessAccount.name;
      }
    } catch (error) {
      console.error('Error fetching business account:', error);
    }
  }

  // If not a business account, get landlord info
  if (publisherType === 'individual' && !listing.businessAccountId) {
    try {
      const landlordInfo = await db.query.landlords.findFirst({
        where: eq(landlords.id, listing.landlordId),
        with: {
          user: true,
        },
      });
      
      if (landlordInfo?.user) {
        publisherName = landlordInfo.user.name || landlordInfo.user.email;
      }
    } catch (error) {
      console.error('Error fetching landlord info:', error);
    }
  }

  const pageBaseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://stayrental.lk';
  const listingUrl = `${pageBaseUrl}/listings/${listing.id}`;

  let photos: string[] = [];
  if (typeof listing.photos === 'string') {
    try {
      const parsed = JSON.parse(listing.photos);
      photos = Array.isArray(parsed) ? parsed : [];
    } catch {
      photos = [];
    }
  } else if (Array.isArray(listing.photos)) {
    photos = listing.photos;
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: listing.title,
    description: listing.description ?? undefined,
    url: listingUrl,
    address: {
      '@type': 'PostalAddress',
      streetAddress: listing.address,
      addressLocality: listing.city,
      addressRegion: listing.district ?? undefined,
      addressCountry: 'LK',
    },
    ...(listing.latitude && listing.longitude
      ? { geo: { '@type': 'GeoCoordinates', latitude: listing.latitude, longitude: listing.longitude } }
      : {}),
    offers: {
      '@type': 'Offer',
      price: Number(listing.rentPerMonth),
      priceCurrency: 'LKR',
      availability: listing.status === 'active' ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
    },
    numberOfBedrooms: listing.bedrooms,
    numberOfBathroomsTotal: listing.bathrooms ?? undefined,
    floorSize: listing.areaSqft ? { '@type': 'QuantitativeValue', value: listing.areaSqft, unitCode: 'FTK' } : undefined,
    ...(photos.length > 0 ? { image: photos } : {}),
  };

  const jsonLdHtml = JSON.stringify(jsonLd).replace(/</g, '\\u003c');

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml }}
      />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-5">
        <ol className="flex items-center gap-1 text-sm text-slate-500">
          <li>
            <a href="/" className="hover:text-teal-700 transition-colors">Home</a>
          </li>
          <li><ChevronRight className="h-3.5 w-3.5 text-slate-300" /></li>
          <li>
            <a href="/listings" className="hover:text-teal-700 transition-colors">Listings</a>
          </li>
          <li><ChevronRight className="h-3.5 w-3.5 text-slate-300" /></li>
          <li className="text-slate-800 font-medium truncate max-w-[240px]">
            {listing.title}
          </li>
        </ol>
      </nav>

      {listing.status !== 'active' && (
        <div className={`mb-4 p-4 rounded-lg ${
          listing.status === 'pending' 
            ? 'bg-yellow-50 border border-yellow-200' 
            : listing.status === 'rented'
            ? 'bg-teal-50 border border-teal-200'
            : listing.status === 'rejected'
            ? 'bg-red-50 border border-red-200'
            : 'bg-gray-50 border border-gray-200'
        }`}>
          <p className={`text-sm font-medium ${
            listing.status === 'pending'
              ? 'text-yellow-800'
              : listing.status === 'rented'
              ? 'text-teal-800'
              : listing.status === 'rejected'
              ? 'text-red-800'
              : 'text-gray-800'
          }`}>
            Status: <span className="capitalize">{listing.status}</span>
            {listing.status === 'pending' && ' - This listing is awaiting approval'}
            {listing.status === 'rented' && ' - This property has been rented'}
            {listing.status === 'archived' && ' - This listing has been archived'}
            {listing.status === 'rejected' && ' - This listing was rejected'}
          </p>
          {listing.status === 'rejected' && listing.rejectionReason && (
            <div className="mt-3 pt-3 border-t border-red-200">
              <p className="text-xs font-medium text-red-800 mb-1">Rejection Reason:</p>
              <p className="text-xs text-red-700">{listing.rejectionReason}</p>
            </div>
          )}
        </div>
      )}
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {listing.title}
            </h1>
            <div className="flex items-center text-gray-600 mb-4">
              <MapPin className="h-5 w-5 mr-2" />
              {listing.address}, {listing.city}
              {listing.district && `, ${listing.district}`}
            </div>
          </div>

          {/* Property Images */}
          {(() => {
            let photos: string[] = [];
            if (typeof listing.photos === 'string') {
              try {
                const parsed = JSON.parse(listing.photos);
                photos = Array.isArray(parsed) ? parsed : [];
              } catch (e) {
                photos = [];
              }
            } else if (Array.isArray(listing.photos)) {
              photos = listing.photos;
            }
            return photos.length > 0 ? (
              <div className="mb-6">
                <PropertyImagesGallery images={photos} title={listing.title} />
              </div>
            ) : null;
          })()}

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Publisher Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <div className="flex items-center">
                  {publisherType === 'business' ? (
                    <>
                      <Building2 className="h-5 w-5 mr-2 text-teal-700" />
                      <span className="font-medium">{publisherName}</span>
                    </>
                  ) : (
                    <>
                      <User className="h-5 w-5 mr-2 text-gray-600" />
                      <span className="font-medium">{publisherName}</span>
                    </>
                  )}
                </div>
                <div className="flex items-center text-gray-500">
                  <Calendar className="h-4 w-4 mr-1" />
                  <span suppressHydrationWarning>
                    {new Date(listing.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {listing.description && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 whitespace-pre-line">
                  {listing.description}
                </p>
              </CardContent>
            </Card>
          )}

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Property Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex items-center">
                  <Home className="h-5 w-5 mr-2 text-gray-600" />
                  <span className="text-gray-700">
                    Type: {listing.propertyType || 'N/A'}
                  </span>
                </div>
                {listing.bedrooms && (
                  <div className="flex items-center">
                    <Bed className="h-5 w-5 mr-2 text-gray-600" />
                    <span className="text-gray-700">
                      {listing.bedrooms} Bedroom{listing.bedrooms > 1 ? 's' : ''}
                    </span>
                  </div>
                )}
                {listing.bathrooms && (
                  <div className="flex items-center">
                    <Bath className="h-5 w-5 mr-2 text-gray-600" />
                    <span className="text-gray-700">
                      {listing.bathrooms} Bathroom{listing.bathrooms > 1 ? 's' : ''}
                    </span>
                  </div>
                )}
                {listing.areaSqft && (
                  <div className="flex items-center">
                    <span className="text-gray-700">
                      Area: {listing.areaSqft} sq ft
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Sri Lanka-Specific Features</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                {listing.powerBackup && (
                  <div className="flex items-center">
                    <Zap className="h-5 w-5 mr-2 text-orange-500" />
                    <span className="text-gray-700">
                      Power Backup: {listing.powerBackup}
                    </span>
                  </div>
                )}
                {listing.waterSource && (
                  <div className="flex items-center">
                    <Droplet className="h-5 w-5 mr-2 text-cyan-500" />
                    <span className="text-gray-700">
                      Water Source: {listing.waterSource}
                      {listing.waterTankSize && ` (${listing.waterTankSize}L tank)`}
                    </span>
                  </div>
                )}
                {listing.hasFiber && (
                  <div className="flex items-center">
                    <Wifi className="h-5 w-5 mr-2 text-teal-600" />
                    <span className="text-gray-700">
                      Fiber Internet Available
                      {listing.fiberISPs && ` (${listing.fiberISPs})`}
                    </span>
                  </div>
                )}
                {listing.acUnits && (
                  <div className="text-gray-700">
                    AC Units: {listing.acUnits}
                  </div>
                )}
                {listing.fans && (
                  <div className="text-gray-700">Fans: {listing.fans}</div>
                )}
                {listing.ventilation && (
                  <div className="text-gray-700">
                    Ventilation: {listing.ventilation}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Safety & Security</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                {listing.isGated && (
                  <div className="text-gray-700">✓ Gated Community</div>
                )}
                {listing.hasGuard && (
                  <div className="text-gray-700">✓ Security Guard</div>
                )}
                {listing.hasCCTV && (
                  <div className="text-gray-700">✓ CCTV</div>
                )}
                {listing.hasBurglarBars && (
                  <div className="text-gray-700">✓ Burglar Bars</div>
                )}
              </div>
            </CardContent>
          </Card>

          {listing.verified && (
            <Card className="mb-6 border-green-200 bg-green-50">
              <CardContent className="pt-6">
                <div className="flex items-center">
                  <Shield className="h-5 w-5 mr-2 text-green-600" />
                  <span className="text-green-800 font-medium">
                    Verified Property
                  </span>
                </div>
                {listing.verifiedAt && (
                  <p className="text-sm text-green-700 mt-1" suppressHydrationWarning>
                    Verified on{' '}
                    {new Date(listing.verifiedAt).toLocaleDateString()}
                  </p>
                )}
                {listing.visited && listing.visitedAt && (
                  <p className="text-sm text-green-700" suppressHydrationWarning>
                    Property visited on{' '}
                    {new Date(listing.visitedAt).toLocaleDateString()}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-1">
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <div className="text-3xl font-bold text-gray-900 mb-2">
                  LKR {Number(listing.rentPerMonth).toLocaleString()}
                  <span className="text-lg font-normal text-gray-600">/month</span>
                </div>
                {listing.depositMonths && (
                  <div className="text-gray-600 mb-2">
                    Deposit: {listing.depositMonths} months (
                    {(
                      Number(listing.rentPerMonth) * listing.depositMonths
                    ).toLocaleString()}{' '}
                    LKR)
                  </div>
                )}
                {listing.utilitiesIncluded && (
                  <div className="text-sm text-green-600 mb-2">
                    ✓ Utilities included
                  </div>
                )}
                {listing.serviceCharge && (
                  <div className="text-sm text-gray-600">
                    Service Charge: LKR{' '}
                    {Number(listing.serviceCharge).toLocaleString()}/month
                  </div>
                )}
                {listing.noticePeriodDays && (
                  <div className="text-sm text-gray-600 mt-2">
                    Notice Period: {listing.noticePeriodDays} days
                  </div>
                )}
              </div>

              {/* Contact Owner / Publisher */}
              {listing.status === 'active' && (
                <>
                  {isLoggedIn ? (
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <Phone className="h-4 w-4 text-teal-700" />
                        Contact {publisherType === 'business' ? 'Publisher' : 'Owner'}
                      </h4>

                      {(() => {
                        const verifiedContacts = listing.contactNumbers?.filter((lc) => {
                          const c = lc.contactNumber;
                          return c && c.isActive && c.verified;
                        }) ?? [];

                        const activeContacts = verifiedContacts.length > 0
                          ? verifiedContacts
                          : (listing.contactNumbers?.filter((lc) => lc.contactNumber?.isActive) ?? []);

                        const publisherPhone = listing.landlord?.user?.phone ?? null;

                        if (activeContacts.length > 0) {
                          return (
                            <div className="space-y-2">
                              {activeContacts.map((lc) => {
                                const contact = lc.contactNumber;
                                if (!contact) return null;
                                return (
                                  <div key={contact.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                    <div className="flex items-center gap-2 mb-2">
                                      <span className="font-semibold text-sm text-gray-900">{contact.phoneNumber}</span>
                                      {contact.verified && (
                                        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded">
                                          Verified
                                        </span>
                                      )}
                                      {contact.label && (
                                        <span className="text-xs text-gray-500">· {contact.label}</span>
                                      )}
                                    </div>
                                    <div className="flex gap-2">
                                      <a
                                        href={`tel:${contact.phoneNumber}`}
                                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-teal-700 text-white hover:bg-teal-800 transition-colors"
                                      >
                                        <Phone className="h-3.5 w-3.5" />
                                        Call
                                      </a>
                                      {contact.isWhatsApp && (
                                        <a
                                          href={`https://wa.me/${contact.phoneNumber.replace(/[^0-9+]/g, '')}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                                        >
                                          <MessageCircle className="h-3.5 w-3.5" />
                                          WhatsApp
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }

                        if (publisherPhone) {
                          return (
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="font-semibold text-sm text-gray-900">{publisherPhone}</span>
                                <span className="text-xs text-gray-500">· Publisher</span>
                              </div>
                              <a
                                href={`tel:${publisherPhone}`}
                                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-teal-700 text-white hover:bg-teal-800 transition-colors"
                              >
                                <Phone className="h-3.5 w-3.5" />
                                Call
                              </a>
                            </div>
                          );
                        }

                        return (
                          <p className="text-sm text-gray-500 py-2">
                            No contact numbers available for this listing.
                          </p>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-5 text-center">
                      <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-3">
                        <Phone className="h-5 w-5 text-teal-700" />
                      </div>
                      <p className="text-sm font-semibold text-gray-800 mb-1">
                        Contact the {publisherType === 'business' ? 'publisher' : 'owner'}
                      </p>
                      <p className="text-xs text-gray-500 mb-4">
                        Sign in to view verified contact numbers and reach the property {publisherType === 'business' ? 'publisher' : 'owner'} directly.
                      </p>
                      <Button asChild className="w-full bg-teal-700 hover:bg-teal-800 text-white">
                        <a href={`/sign-in?redirect=/listings/${listing.id}`}>
                          Sign in to see contact details
                        </a>
                      </Button>
                      <p className="text-[10px] text-gray-400 mt-2">
                        Don&apos;t have an account?{' '}
                        <a href={`/sign-up?redirect=/listings/${listing.id}`} className="text-teal-700 font-medium hover:underline">
                          Sign up free
                        </a>
                      </p>
                    </div>
                  )}
                </>
              )}
              {listing.status !== 'active' && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-800">
                    This listing is currently <span className="font-semibold capitalize">{listing.status}</span>.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {listing.status === 'active' && (
        <div className="mt-8">
          <SocialShare url={listingUrl} title={listing.title} />
        </div>
      )}

      {listing.status === 'active' && (
        <SimilarListings
          currentListingId={listing.id}
          city={listing.city}
          bedrooms={listing.bedrooms}
          rentPerMonth={Number(listing.rentPerMonth)}
        />
      )}
      </main>
    </>
  );
}

