import { getActiveListings } from '@/lib/db/queries';
import { ListingCard } from './listing-card';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export async function FeaturedListings() {
  const allListings = await getActiveListings({ limit: 1000 });

  const featured = allListings.filter((l) => l.verified || l.visited).slice(0, 6);
  const display = featured.length > 0 ? featured : allListings.slice(0, 6);

  if (display.length === 0) return null;

  const isVerified = featured.length > 0;

  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
          <div>
            <span className="inline-block px-3 py-1 text-xs font-semibold tracking-widest text-teal-800 bg-teal-50 border border-teal-200 rounded-full uppercase mb-3">
              {isVerified ? 'Hand-picked' : 'Latest'}
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 leading-tight">
              {isVerified ? 'Verified Properties' : 'Browse Properties'}
            </h2>
            <p className="text-slate-500 mt-1.5">
              {isVerified
                ? 'KYC verified and site-visited by our team'
                : 'Explore available rentals across Sri Lanka'}
            </p>
          </div>
          <Link
            href="/listings"
            className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-800 hover:text-white hover:border-teal-800 transition-all duration-200"
          >
            View All Listings
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {display.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      </div>
    </section>
  );
}
