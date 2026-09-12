import 'server-only';
import { Users } from 'lucide-react';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { getSiblingAgents } from '@/lib/properties/fingerprint';
import { resolvePublishers } from '@/lib/listings/publisher-info';
import { db } from '@/lib/db/drizzle';
import { listings as listingsTable } from '@/lib/db/schema';
import { inArray } from 'drizzle-orm';

/**
 * "One property, every agent on it" (FORGE.md Concept 2). Renders nothing
 * when the flag is off, when this listing was never attached to a property
 * (e.g. no address, or grouping was off at creation time), or when it has no
 * siblings yet — which today is every listing, because grouping only starts
 * counting sibling attachments from whenever it was turned on. Fee disclosure
 * is per-agent and optional (POSITIONING.md / FORGE.md Q3): an attachment
 * that never disclosed a fee still appears, just without the line naming it.
 */
export async function SiblingAgents({ listingId }: { listingId: number }) {
  if (!isFeatureEnabled('enablePropertyGrouping')) return null;

  const siblings = await getSiblingAgents(listingId);
  if (siblings.length === 0) return null;

  const siblingListings = await db
    .select({
      id: listingsTable.id,
      landlordId: listingsTable.landlordId,
      businessAccountId: listingsTable.businessAccountId,
      createdBy: listingsTable.createdBy,
    })
    .from(listingsTable)
    .where(
      inArray(
        listingsTable.id,
        siblings.map((s) => s.listingId)
      )
    );

  const publishers = await resolvePublishers(siblingListings);
  const feeBySiblingListingId = new Map(siblings.map((s) => [s.listingId, s]));

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
      <h4 className="text-sm font-semibold text-amber-900 flex items-center gap-2">
        <Users className="h-4 w-4" />
        Also listed by {siblingListings.length} other agent
        {siblingListings.length === 1 ? '' : 's'}
      </h4>
      <p className="text-xs text-amber-800">
        This property appears to have more than one listing. Compare terms before you call —
        Easy Rent never takes a commission from any of them.
      </p>
      <ul className="space-y-1.5">
        {siblingListings.map((sl) => {
          const publisher = publishers.get(sl.id);
          const fee = feeBySiblingListingId.get(sl.id);
          return (
            <li key={sl.id} className="text-xs text-amber-900 flex items-center justify-between">
              <a href={`/listings/${sl.id}`} className="font-medium underline underline-offset-2">
                {publisher?.publisherName ?? 'Another agent'}
              </a>
              <span className="text-amber-700">
                {fee?.feeDisclosed
                  ? fee.feeNotes ?? `Fee: ${fee.feePayer ?? 'undisclosed payer'}`
                  : 'Fee not disclosed'}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
