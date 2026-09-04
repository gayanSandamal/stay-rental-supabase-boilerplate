import Link from 'next/link';
import { Images, Search, Share2 } from 'lucide-react';
import { publishablePhotos } from '@/lib/social/images';

/**
 * The way in to posting a listing by hand.
 *
 * The list below this panel is a LOG OF POSTS, not a picker — it reads
 * `listing_social_posts`, so it is empty until something has actually been
 * posted and can never be the route to posting the first one. Without this
 * control the review screen is reachable only by typing its URL, which is how
 * the manual path shipped and why nobody could find it.
 *
 * Deliberately NOT the existing search box: that one filters posts, and wiring
 * it to also mean "find a listing" would make one input answer two different
 * questions depending on what happens to exist.
 */

export interface PickerListing {
  id: number;
  title: string;
  city: string | null;
  photos: string | null;
  photosManifest: string | null;
}

export function ListingPicker({
  listings,
  query,
  hasQuery,
  keep,
}: {
  listings: PickerListing[];
  query: string;
  /** Whether the operator searched, vs. this being the default recent list. */
  hasQuery: boolean;
  /**
   * The post-log's own view state (tab, search), carried through as hidden
   * fields. Without them, searching for a listing would silently reset the
   * filters on the list below — two unrelated controls resetting each other.
   */
  keep: Record<string, string>;
}) {
  return (
    <section className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Share2 className="h-4 w-4 text-teal-700" />
          Post a listing to TikTok
        </h2>

        {/* A plain GET form: the result is a linkable URL like every other
            back-office view, so one operator can hand a search to another. */}
        <form method="get" className="flex items-center gap-2">
          {Object.entries(keep).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <label htmlFor="find" className="sr-only">
            Search active listings
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              id="find"
              name="find"
              defaultValue={query}
              placeholder="Search active listings by title or #id"
              className="w-64 rounded-md border border-slate-300 py-1.5 pl-7 pr-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none"
            />
          </div>
        </form>
      </div>

      <p className="mt-1 text-xs text-slate-500">
        {hasQuery
          ? 'Active listings matching your search.'
          : 'Your most recently published listings. Only an active listing can be posted.'}
      </p>

      {listings.length === 0 ? (
        <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {hasQuery
            ? 'No active listing matches that. Only listings that are live on Easy Rent can be posted.'
            : 'No active listings yet. Publish one first — a pending or expired listing cannot be posted.'}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {listings.map((listing) => {
            // Shown because a one-photo post is a thin carousel, and the count
            // is invisible until you are already on the review screen.
            const photoCount = publishablePhotos(listing).length;
            return (
              <li key={listing.id}>
                <Link
                  href={`/back-office/social/post/${listing.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm hover:bg-slate-50"
                >
                  <span className="font-mono text-xs text-slate-500">#{listing.id}</span>
                  <span className="font-medium text-slate-900">{listing.title}</span>
                  {listing.city && <span className="text-slate-500">{listing.city}</span>}
                  <span
                    className={`ml-auto inline-flex items-center gap-1 text-xs ${
                      photoCount === 0
                        ? 'text-rose-700'
                        : photoCount === 1
                          ? 'text-amber-700'
                          : 'text-slate-500'
                    }`}
                  >
                    <Images className="h-3.5 w-3.5" />
                    {photoCount === 0
                      ? 'no photos — cannot post'
                      : `${photoCount} photo${photoCount === 1 ? '' : 's'}`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
