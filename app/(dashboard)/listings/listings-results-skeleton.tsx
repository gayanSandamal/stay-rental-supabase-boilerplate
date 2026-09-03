/**
 * What the renter sees the instant they click "Browse Listings".
 *
 * This is the half of the fix that `force-dynamic` removal cannot deliver on its
 * own: the shell now prerenders, but the listings themselves still wait on the
 * database. Without a fallback shaped like the real result set, the page paints
 * its header and then jumps when the cards arrive.
 *
 * The card count and the grid columns deliberately match
 * <EnhancedListingsGrid>'s default grid view, and the count line reserves the
 * same vertical space as the real one, so nothing shifts on arrival.
 */
export function ListingsResultsSkeleton() {
  return (
    <>
      <div className="h-5 w-56 bg-gray-200 rounded animate-pulse -mt-4 mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
          >
            <div className="aspect-[4/3] bg-gray-200 animate-pulse" />
            <div className="p-4 space-y-3">
              <div className="h-5 w-3/4 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-1/2 bg-gray-100 rounded animate-pulse" />
              <div className="flex gap-2 pt-1">
                <div className="h-6 w-16 bg-gray-100 rounded-full animate-pulse" />
                <div className="h-6 w-16 bg-gray-100 rounded-full animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
