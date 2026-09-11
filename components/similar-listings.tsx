import { getSimilarListings } from '@/lib/db/queries';
import { resolveViewTotals } from '@/lib/listings/view-totals';
import { ListingCard } from './listing-card';

interface SimilarListingsProps {
  currentListingId: number;
  city: string;
  bedrooms: number;
  rentPerMonth: number;
}

export async function SimilarListings({
  currentListingId,
  city,
  bedrooms,
  rentPerMonth,
}: SimilarListingsProps) {
  const similar = await getSimilarListings(currentListingId, city, bedrooms, rentPerMonth);

  if (similar.length === 0) return null;

  // Two set-based queries for the row, never one per card. The detail page has
  // already loaded the flag snapshot, so the gate inside is live here.
  const viewTotals = await resolveViewTotals(similar.map((l) => l.id));

  return (
    <section className="mt-12">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Similar Listings</h2>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        {similar.map((listing) => (
          <ListingCard
            key={listing.id}
            listing={{ ...listing, viewTotal: viewTotals.get(listing.id) }}
          />
        ))}
      </div>
    </section>
  );
}
