import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { properties, propertyAgents } from '@/lib/db/schema';

export { computeFingerprint } from './fingerprint-pure';
import { computeFingerprint } from './fingerprint-pure';

/**
 * Attach a listing to its property, creating the property row on first sight
 * of a fingerprint. Idempotent per listing (propertyAgents.listingId is
 * unique) — safe to call more than once for the same listing. See
 * fingerprint-pure.ts for the matching rationale, and FORGE.md's Concept 2
 * Q4 for why there is no "owner"/"claimed by" concept here — the property
 * record is neutral, agents are attachments, never claims to be won.
 */
export async function attachListingToProperty(listing: {
  id: number;
  address: string | null;
  city: string;
  bedrooms: number | null;
}): Promise<void> {
  const fingerprint = computeFingerprint(listing);
  if (!fingerprint) return;

  try {
    const already = await db.query.propertyAgents.findFirst({
      where: eq(propertyAgents.listingId, listing.id),
    });
    if (already) return;

    let property = await db.query.properties.findFirst({
      where: eq(properties.fingerprint, fingerprint),
    });
    if (!property) {
      [property] = await db
        .insert(properties)
        .values({
          fingerprint,
          city: listing.city,
          bedrooms: listing.bedrooms,
        })
        .returning();
    }

    await db.insert(propertyAgents).values({
      propertyId: property.id,
      listingId: listing.id,
      feeDisclosed: false,
    });
  } catch (error) {
    // Grouping is a discovery aid, not correctness-critical to the listing
    // itself — a failure here must never block or fail listing creation.
    console.error('[properties] attach failed for listing', listing.id, error);
  }
}

export type SiblingAgent = {
  listingId: number;
  feeDisclosed: boolean;
  feePayer: string | null;
  feeAmount: number | null;
  feeNotes: string | null;
};

/** Other agents' listings attached to the same property as `listingId`. */
export async function getSiblingAgents(listingId: number): Promise<SiblingAgent[]> {
  const own = await db.query.propertyAgents.findFirst({
    where: eq(propertyAgents.listingId, listingId),
  });
  if (!own) return [];

  const siblings = await db.query.propertyAgents.findMany({
    where: eq(propertyAgents.propertyId, own.propertyId),
  });

  return siblings
    .filter((s) => s.listingId !== listingId)
    .map((s) => ({
      listingId: s.listingId,
      feeDisclosed: s.feeDisclosed,
      feePayer: s.feePayer,
      feeAmount: s.feeAmount,
      feeNotes: s.feeNotes,
    }));
}
