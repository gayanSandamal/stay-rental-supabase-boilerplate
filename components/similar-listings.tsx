import { getSimilarListings } from '@/lib/db/queries';
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

  return (
    <section className="mt-12">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Similar Listings</h2>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        {similar.map((listing) => (
          <ListingCard key={listing.id} listing={listing} />
        ))}
      </div>
    </section>
  );
}
