import { ListingsResultsSkeleton } from './listings-results-skeleton';

/**
 * Shown the moment "Browse Listings" is clicked.
 *
 * A route segment with no `loading.tsx` and no prerendered shell gives the
 * router nothing to paint, so the previous page just sits there until the whole
 * server render finishes — which is exactly what "it takes time to load new
 * pages" described. This is the floor: even if the data is slow, something
 * appears immediately.
 */
export default function Loading() {
  return (
    <main className="min-h-screen bg-[#F7F4ED]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <div className="h-9 w-64 bg-gray-200 rounded animate-pulse mb-5" />
          <div className="flex gap-3">
            <div className="flex-1 h-11 bg-white rounded-xl animate-pulse" />
            <div className="w-24 h-11 bg-white rounded-xl animate-pulse" />
          </div>
        </div>
        <ListingsResultsSkeleton />
      </div>
    </main>
  );
}
