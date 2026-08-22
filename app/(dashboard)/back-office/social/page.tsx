import { requireBackOfficeAccess } from '@/lib/auth/back-office';
import { db } from '@/lib/db/drizzle';
import { listings, listingSocialPosts } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Share2, ExternalLink, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { adapterFor, socialAdapters, isPlatformEnabled } from '@/lib/social/registry';
import { isDryRunPost, type SocialPlatform } from '@/lib/social/types';
import { checkSocialCredentials, platformStatusLine } from '@/lib/social/health';
import { groupByListing } from '@/lib/social/group';
import { ListingSocialActions, RetryAllFailed, SocialActions } from './social-actions';

export const dynamic = 'force-dynamic';

const STATUS_STYLES: Record<string, string> = {
  queued: 'bg-sky-100 text-sky-800',
  running: 'bg-indigo-100 text-indigo-800',
  posted: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-rose-100 text-rose-800',
  skipped: 'bg-amber-100 text-amber-800',
  pulled: 'bg-slate-200 text-slate-700',
};

/** Health tone → the dot beside the platform name. */
const TONE_DOT: Record<string, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  bad: 'bg-rose-500',
  off: 'bg-slate-300',
};

const PLATFORM_LABELS: Record<string, string> = {
  facebook_page: 'Facebook Page',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook_group: 'Facebook Group',
};

export default async function SocialPage() {
  await requireBackOfficeAccess();
  await loadFeatureFlags(true);

  const rows = await db
    .select({
      post: listingSocialPosts,
      listingTitle: listings.title,
      listingStatus: listings.status,
    })
    .from(listingSocialPosts)
    .leftJoin(listings, eq(listingSocialPosts.listingId, listings.id))
    .orderBy(desc(listingSocialPosts.createdAt))
    // Grouped by listing below, so this is ~50 listings rather than 200.
    .limit(200);

  const enabled = isFeatureEnabled('enableSocialAutoPublish');
  // Never throws by contract — a health readout must not be able to take this
  // page down. Cached per instance for a minute.
  const health = await checkSocialCredentials();
  const failedCount = rows.filter(({ post }) => post.status === 'failed').length;
  const groups = groupByListing(rows);

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="flex items-center gap-3 mb-6">
        <Share2 className="h-6 w-6 text-teal-700" />
        <h1 className="text-2xl font-bold text-slate-900">Social</h1>
      </div>

      {!enabled && (
        <Card className="mb-6 border-amber-300 bg-amber-50">
          <CardContent className="py-4 text-sm text-amber-900">
            Social auto-publish is <strong>off</strong>. Nothing new is being queued or posted.
            Turn it on in <Link href="/back-office/settings" className="underline">Settings</Link>.
          </CardContent>
        </Card>
      )}

      {/* Which platforms can actually post — checked against the platforms, not
          just against the env vars. An env-presence readout said "live" for the
          31 minutes every Facebook post was failing on an expired token. */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Platform configuration</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 text-sm">
          {socialAdapters.map((adapter) => {
            const status = platformStatusLine(
              health[adapter.platform],
              isPlatformEnabled(adapter.platform)
            );
            return (
              <div key={adapter.platform} className="flex items-start gap-2">
                <span
                  className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${TONE_DOT[status.tone]}`}
                />
                <span className="font-medium text-slate-800 shrink-0">
                  {PLATFORM_LABELS[adapter.platform] ?? adapter.platform}
                </span>
                <span className="text-slate-500">{status.text}</span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* The single most important thing for a reviewer to know before they
          click "pull down" and assume the post is gone. */}
      <Card className="mb-6 border-slate-300 bg-slate-50">
        <CardContent className="py-4 text-sm text-slate-700 space-y-1">
          <p className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
            <span>
              Only <strong>Facebook Page</strong> posts can be deleted through the API. On{' '}
              <strong>Instagram</strong> and <strong>TikTok</strong>, &ldquo;Mark for removal&rdquo;
              records the decision and gives you the link — you still have to delete the post
              yourself.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
            <span>
              <strong>Facebook Groups</strong> cannot be posted to programmatically (Meta removed
              the Groups API in April 2024). Those rows are drafts: copy the caption, post it, then
              mark it done.
            </span>
          </p>
        </CardContent>
      </Card>

      {failedCount > 0 && (
        <div className="mb-4 flex justify-end">
          <RetryAllFailed count={failedCount} />
        </div>
      )}

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-slate-500">
            Nothing queued yet. Posts appear here once a landlord agrees to share a published
            listing.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <Card key={group.listingId}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">
                    {group.title ?? `Listing #${group.listingId}`}
                  </CardTitle>
                  <Link
                    href={`/dashboard/listings/${group.listingId}`}
                    className="inline-flex items-center gap-1 text-sm text-teal-700 hover:underline"
                  >
                    #{group.listingId} <ExternalLink className="h-3 w-3" />
                  </Link>
                  {group.listingStatus && group.listingStatus !== 'active' && (
                    <span className="rounded px-2 py-0.5 text-xs font-medium bg-rose-100 text-rose-800">
                      listing {group.listingStatus}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-slate-500">{group.summary}</span>
                </div>
              </CardHeader>

              <CardContent className="space-y-3 text-sm">
                {/* One row per platform. Four cards for one listing was the
                    reason this page was unreadable. */}
                <div className="divide-y divide-slate-100">
                  {group.posts.map((post) => {
                    const adapter = adapterFor(post.platform as SocialPlatform);
                    const dryRun = isDryRunPost(post.remotePostId);
                    return (
                      <div key={post.id} className="flex flex-wrap items-center gap-2 py-2">
                        <span className="rounded px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700 min-w-[7.5rem]">
                          {PLATFORM_LABELS[post.platform] ?? post.platform}
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            STATUS_STYLES[post.status] ?? 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {post.status}
                        </span>
                        {dryRun && (
                          <span className="rounded px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-900">
                            dry run — nothing was sent
                          </span>
                        )}
                        {post.remotePermalink && (
                          <a
                            href={post.remotePermalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-teal-700 hover:underline"
                          >
                            View post <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {post.postedAt && (
                          <span className="text-xs text-slate-500">
                            {post.postedAt.toLocaleString()}
                          </span>
                        )}
                        {post.attempts > 0 && (
                          <span className="text-xs text-slate-500">{post.attempts} attempt(s)</span>
                        )}
                        {post.error && (
                          <span
                            className={`text-xs ${
                              post.error.includes('REMOVE BY HAND')
                                ? 'text-rose-700 font-medium'
                                : 'text-slate-500'
                            }`}
                          >
                            {post.error}
                          </span>
                        )}
                        <span className="ml-auto">
                          <SocialActions
                            postId={post.id}
                            status={post.status}
                            platform={post.platform}
                            caption={post.caption}
                            supportsRemove={adapter?.supportsRemove ?? false}
                            dryRun={dryRun}
                          />
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Captions are per-platform shaped (Instagram says "link in
                    bio", TikTok caps the title), so they are not always equal —
                    but they usually are. Render each DISTINCT caption once,
                    labelled with the platforms that share it. */}
                {group.captions.map(({ caption, platforms }) => (
                  <div key={caption} className="space-y-1">
                    {group.captions.length > 1 && (
                      <p className="text-xs font-medium text-slate-500">
                        {platforms.map((pf) => PLATFORM_LABELS[pf] ?? pf).join(' · ')}
                      </p>
                    )}
                    <pre className="whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs text-slate-700 max-h-40 overflow-y-auto">
                      {caption}
                    </pre>
                  </div>
                ))}

                <ListingSocialActions
                  listingId={group.listingId}
                  failedCount={group.failed}
                  livePostCount={group.live}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

    </section>
  );
}
