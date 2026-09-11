import { Eye, Facebook, Instagram, Music2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getListingViewBreakdown } from '@/lib/db/queries';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import type { SocialPlatform } from '@/lib/social/types';

/**
 * "How many people have seen this" — the listing's own page views alongside the
 * views Facebook, Instagram and TikTok report for its posts. Public: a renter
 * sees the same numbers the landlord does.
 *
 * A server component behind its own Suspense boundary. Two DB queries, and the
 * listing itself must not wait on them — the page above is already dynamic
 * (`getUser()` reads cookies), so the only thing keeping these off the critical
 * path is the boundary (CLAUDE.md, "Dynamic work belongs BELOW a Suspense
 * boundary").
 *
 * THE DISPLAY RULE, which is the whole reason this is a component and not two
 * lines of JSX inline:
 *
 *   a platform with no live post  → no line at all
 *   a platform with no reading    → "—"
 *   a platform with a reading     → the number
 *
 * Never 0 for either of the first two. A landlord reading "Facebook views: 0"
 * concludes their advert was ignored; the truth is usually that we could not
 * read the figure, or never posted there. Zero is reserved for the one case
 * where the platform actually told us zero.
 */

const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  facebook_page: 'Facebook views',
  instagram: 'Instagram views',
  tiktok: 'TikTok views',
  // Present only to satisfy the record: a group post has no readable id, so it
  // never reaches this component (see MEASURABLE_PLATFORMS).
  facebook_group: 'Facebook Group views',
};

const PLATFORM_ICONS: Record<SocialPlatform, typeof Facebook> = {
  facebook_page: Facebook,
  instagram: Instagram,
  // lucide ships no TikTok glyph; a music note is the closest honest stand-in.
  tiktok: Music2,
  facebook_group: Facebook,
};

function ViewRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Eye;
  label: string;
  value: number | null;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center text-gray-600">
        <Icon className="h-4 w-4 mr-2 text-teal-700" aria-hidden="true" />
        {label}
      </span>
      {value === null ? (
        <span
          className="font-medium text-gray-400"
          title="We could not read this figure from the platform"
        >
          —
        </span>
      ) : (
        <span className="font-semibold text-gray-900">{value.toLocaleString('en-US')}</span>
      )}
    </div>
  );
}

export async function ListingViewCounts({ listingId }: { listingId: number }) {
  /*
   * The flag is read here rather than by the page, so the kill switch cannot
   * depend on whether the root layout's `loadFeatureFlags()` happened to settle
   * before the page body ran. Awaiting it again is free — the store is
   * per-instance and TTL-cached (CACHE_TTL_MS = 30s).
   */
  await loadFeatureFlags();
  if (!isFeatureEnabled('showPublicViewCounts')) return null;

  const breakdown = await getListingViewBreakdown(listingId);

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Views</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <ViewRow icon={Eye} label="Website views" value={breakdown.website} />
          {breakdown.social.map((entry) => (
            <ViewRow
              key={entry.platform}
              icon={PLATFORM_ICONS[entry.platform]}
              label={PLATFORM_LABELS[entry.platform]}
              value={entry.views}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** Keeps the card's height while the counts load, so nothing below it jumps. */
export function ListingViewCountsSkeleton() {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Views</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2" aria-hidden="true">
          <div className="h-5 bg-gray-100 rounded animate-pulse" />
        </div>
      </CardContent>
    </Card>
  );
}
