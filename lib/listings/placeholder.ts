/**
 * The image every public surface shows for a listing whose landlord has not
 * uploaded a photo yet.
 *
 * It is a branded card that says "NO PHOTOS UPLOADED YET" in words, which is
 * the whole point: the empty states it replaces (a teal gradient with a house
 * glyph on the cards, a grey "No images available" box on the detail page)
 * read as a rendering failure rather than as a fact about the listing. A
 * renter cannot tell a property with no photos from a property whose photos
 * failed to load, and a landlord looking at their own listing gets no nudge to
 * fix it.
 *
 * Deliberately NOT used in two places:
 *
 * - **JSON-LD** (`lib/seo/jsonld.ts`). `image` there is a machine-readable
 *   claim that this is a picture of the property. A placeholder is not, and
 *   telling Google otherwise is the same class of lie as a `posted` badge on a
 *   dry run. A listing with no photos emits no `image` at all.
 * - **Back office and social**. Ops screens must show the absence honestly,
 *   and a listing with no photos is not publishable to Instagram or TikTok in
 *   the first place.
 *
 * The Open Graph card DOES use it — that is a share preview, not a claim about
 * the property, and a link with no image at all previews worse than a branded
 * one.
 */

/** Site-relative path to the placeholder. */
export const LISTING_PLACEHOLDER_IMAGE = '/brand/listing-placeholder.jpg';

/** Intrinsic size of the placeholder, for `next/image` and OG metadata. */
export const LISTING_PLACEHOLDER_SIZE = { width: 1200, height: 896 } as const;

/** Alt text. Says what the image means, not what it depicts. */
export const LISTING_PLACEHOLDER_ALT = 'No photos uploaded for this property yet';
