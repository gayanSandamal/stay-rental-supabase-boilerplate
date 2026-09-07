/**
 * Structured-data builders.
 *
 * ── Why the escaping matters ───────────────────────────────────────────────
 * JSON-LD goes into the page through `dangerouslySetInnerHTML`, so a `<` that
 * survives into the script body can close the tag early and turn listing text
 * into markup. `jsonLdHtml()` is the ONLY sanctioned way to serialize these —
 * the listing detail page already did this correctly, the two blocks in
 * app/layout.tsx did not, and the difference was invisible until a landlord
 * typed "<" in a title.
 *
 * ── Availability must never lie ────────────────────────────────────────────
 * `realEstateListing()` refuses to mark anything available unless the caller
 * passes a live listing. A rented, archived or expired property serialized as
 * `InStock` is a structured-data policy violation and, more to the point, it
 * wastes a renter's phone call.
 */

import { listingUrl, absoluteUrl, SITE_URL } from './urls';
import { getFirstListingPhoto } from './photos';

/** Serialize for `dangerouslySetInnerHTML`. Always use this, never bare JSON.stringify. */
export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

type BreadcrumbItem = { name: string; path: string };

/**
 * Breadcrumbs. Google wants these on every page that shows a visual trail —
 * the listing detail page has rendered one since launch with no markup behind
 * it, which is the trail's entire SEO value thrown away.
 */
export function breadcrumbList(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/** An ordered collection of listing URLs — for /listings and /rentals/<area>. */
export function itemList(listingIds: Array<number | string>, name: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: listingIds.length,
    itemListElement: listingIds.map((id, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: listingUrl(id),
    })),
  };
}

/** The shape a listing needs to be described. Structurally satisfied by a `listings` row. */
export type ListingLike = {
  id: number;
  title: string;
  description?: string | null;
  city: string;
  district?: string | null;
  address?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  bedrooms: number;
  bathrooms?: number | null;
  areaSqft?: number | null;
  rentPerMonth: string;
  photos?: unknown;
  status?: string | null;
  expiresAt?: Date | null;
};

/** True only for a listing a renter could actually call about right now. */
export function isListingAvailable(listing: ListingLike): boolean {
  if (listing.status !== 'active') return false;
  if (listing.expiresAt && listing.expiresAt.getTime() <= Date.now()) return false;
  return true;
}

export function realEstateListing(listing: ListingLike) {
  const photo = getFirstListingPhoto(listing.photos);
  const available = isListingAvailable(listing);

  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    '@id': listingUrl(listing.id),
    url: listingUrl(listing.id),
    name: listing.title,
    ...(listing.description ? { description: listing.description } : {}),
    ...(photo ? { image: photo } : {}),
    address: {
      '@type': 'PostalAddress',
      ...(listing.address ? { streetAddress: listing.address } : {}),
      addressLocality: listing.city,
      ...(listing.district ? { addressRegion: listing.district } : {}),
      addressCountry: 'LK',
    },
    ...(listing.latitude && listing.longitude
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: Number(listing.latitude),
            longitude: Number(listing.longitude),
          },
        }
      : {}),
    numberOfBedrooms: listing.bedrooms,
    ...(listing.bathrooms ? { numberOfBathroomsTotal: listing.bathrooms } : {}),
    ...(listing.areaSqft
      ? {
          floorSize: {
            '@type': 'QuantitativeValue',
            value: listing.areaSqft,
            unitCode: 'FTK',
          },
        }
      : {}),
    offers: {
      '@type': 'Offer',
      price: Number(listing.rentPerMonth),
      priceCurrency: 'LKR',
      // Rent is per month — without this the price reads as a sale price.
      unitCode: 'MON',
      availability: available
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url: listingUrl(listing.id),
    },
  };
}

/**
 * A landlord's public profile. `RealEstateAgent` rather than `Person` because
 * the profile represents a letting operation (which may be a business account),
 * and because it is the type Google associates with property listings.
 */
export function realEstateAgent(params: {
  name: string;
  path: string;
  description?: string | null;
  listingCount?: number;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    '@id': absoluteUrl(params.path),
    url: absoluteUrl(params.path),
    name: params.name,
    ...(params.description ? { description: params.description } : {}),
    areaServed: { '@type': 'Country', name: 'Sri Lanka' },
    parentOrganization: { '@type': 'Organization', name: 'Easy Rent', url: SITE_URL },
  };
}

export function faqPage(faqs: Array<{ q: string; a: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}
