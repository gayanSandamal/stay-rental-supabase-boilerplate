import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { ArrowLeft, CheckCircle2, ExternalLink, Info } from 'lucide-react';
import { db } from '@/lib/db/drizzle';
import { listingSocialPosts } from '@/lib/db/schema';
import { getListingById, getUser } from '@/lib/db/queries';
import { canManageListing } from '@/lib/auth/listing-access';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { isDryRunPost } from '@/lib/social/types';
import { pullDownOwnSocialAction } from './actions';
import { PullDownButton } from './pull-down-button';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

/**
 * Where this listing was shared, and the one button that takes it back down.
 *
 * Reached from the WhatsApp link `/l/<token>/s/<id>`. Nothing is mutated by
 * loading this page — a link preview, a prefetch or an accidental long-press
 * cannot pull a live post down. Removal happens on POST, exactly as the delete
 * page works.
 *
 * The copy here is bound by a rule the ops UI already follows: only Facebook
 * Page posts can be deleted through an API. Instagram and TikTok removals are
 * done by hand. Telling a landlord "removed everywhere" when their photos are
 * still on Instagram would be a straightforward lie, so the page says which is
 * which, both before and after.
 */

const PLATFORM_LABELS: Record<string, string> = {
  facebook_page: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

/** Facebook is the only one of the three we can delete through an API. */
const API_REMOVABLE = new Set(['facebook_page']);

export default async function ListingSocialPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pulled?: string }>;
}) {
  const { id } = await params;
  const { pulled } = await searchParams;
  const listingId = Number(id);
  if (!Number.isFinite(listingId) || listingId <= 0) notFound();

  const user = await getUser();
  if (!user) notFound();

  const listing = await getListingById(listingId);
  if (!listing) notFound();

  const allowed = await canManageListing(user, listing);
  if (!allowed) notFound();

  const posts = await db.query.listingSocialPosts.findMany({
    where: eq(listingSocialPosts.listingId, listingId),
  });

  // Only what genuinely reached a platform the landlord can open. A dry run
  // sent nothing, and the Facebook Group row is an internal paste-draft.
  const live = posts.filter(
    (p) =>
      p.status === 'posted' &&
      !isDryRunPost(p.remotePostId) &&
      PLATFORM_LABELS[p.platform] !== undefined
  );
  const removed = posts.filter((p) => p.status === 'pulled');
  const manualPending = removed.filter((p) => !API_REMOVABLE.has(p.platform));

  return (
    <section className="mx-auto max-w-xl flex-1 p-4 lg:p-8">
      <Button asChild variant="outline" className="mb-6">
        <Link href="/dashboard/listings">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to my listings
        </Link>
      </Button>

      {/* --- after a takedown ------------------------------------------------ */}
      {pulled === '1' && (
        <Card className="mb-6 border-emerald-300 bg-emerald-50">
          <CardContent className="py-4 text-sm text-emerald-900 space-y-2">
            <p className="flex items-start gap-2 font-medium">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              Done — your listing is coming off our social media.
            </p>
            <p>The Facebook post has been deleted.</p>
            {manualPending.length > 0 && (
              // Say plainly what has NOT happened yet. Instagram and TikTok
              // expose no delete endpoint, so a person removes those by hand.
              <p>
                {manualPending.map((p) => PLATFORM_LABELS[p.platform] ?? p.platform).join(' and ')}{' '}
                {manualPending.length === 1 ? 'does' : 'do'} not allow apps to delete posts, so our
                team is removing {manualPending.length === 1 ? 'it' : 'them'} by hand — usually
                within a day.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <h1 className="text-2xl font-bold text-slate-900">
        {live.length ? 'Where we shared your listing' : 'Your listing on our social media'}
      </h1>
      <p className="mt-2 text-slate-600">
        &ldquo;{listing.title}&rdquo;
      </p>

      {/* --- what is live ---------------------------------------------------- */}
      {live.length > 0 ? (
        <Card className="mt-6">
          <CardContent className="space-y-3 py-5 text-sm">
            <p className="text-slate-600">
              These are posts on <strong>Easy Rent&rsquo;s own</strong> accounts. Your phone number
              is never included — tenants still reach you through Easy Rent.
            </p>
            <ul className="space-y-2">
              {live.map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  <span className="font-medium text-slate-800">
                    {PLATFORM_LABELS[p.platform] ?? p.platform}
                  </span>
                  {p.remotePermalink ? (
                    <a
                      href={p.remotePermalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-teal-700 hover:underline"
                    >
                      View post <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-slate-500">posted (link not available)</span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : (
        <Card className="mt-6">
          <CardContent className="py-5 text-sm text-slate-600">
            {removed.length
              ? 'Your listing is no longer on our social media.'
              : 'Your listing has not been shared on our social media.'}
          </CardContent>
        </Card>
      )}

      {/* --- the takedown ---------------------------------------------------- */}
      {live.length > 0 && (
        <>
          <h2 className="mt-8 text-lg font-semibold text-slate-900">
            Want it taken down?
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            This removes only the posts on our social accounts.{' '}
            <strong>Your listing stays live on Easy Rent</strong> and tenants can still find it.
          </p>

          <Card className="mt-3 border-slate-300 bg-slate-50">
            <CardContent className="py-4 text-sm text-slate-700">
              <p className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                <span>
                  Facebook comes down straight away. Instagram and TikTok don&rsquo;t let apps
                  delete posts, so our team removes those by hand — usually within a day.
                </span>
              </p>
            </CardContent>
          </Card>

          {/* POST, never GET — see the header comment. */}
          <form action={pullDownOwnSocialAction} className="mt-4">
            <input type="hidden" name="listingId" value={listingId} />
            <PullDownButton />
          </form>
        </>
      )}
    </section>
  );
}
