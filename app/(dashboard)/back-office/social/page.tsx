import { requireBackOfficeAccess } from '@/lib/auth/back-office';
import { db } from '@/lib/db/drizzle';
import { listings, listingSocialPosts } from '@/lib/db/schema';
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  like,
  max,
  not,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { Share2, ExternalLink, AlertTriangle, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { adapterFor, socialAdapters, isPlatformEnabled } from '@/lib/social/registry';
import { DRY_RUN_ID_PREFIX, isDryRunPost, type SocialPlatform } from '@/lib/social/types';
import { checkSocialCredentials, platformStatusLine } from '@/lib/social/health';
import { groupByListing } from '@/lib/social/group';
import { PageHeader } from '@/components/back-office/page-header';
import { AlarmBanner } from '@/components/back-office/alarm-banner';
import { FilterBar } from '@/components/back-office/filter-bar';
import { ListSlab } from '@/components/back-office/list-slab';
import { Pager } from '@/components/back-office/pager';
import { EmptyState } from '@/components/back-office/empty-state';
import { longAge } from '@/lib/back-office/format';
import { parseListParams, type RawSearchParams } from '@/lib/back-office/list-params';
import { ConfirmManualTakedown, RetryAllFailed } from './social-actions';
import { SocialGroupList, type SocialGroupView } from './social-group-list';

export const dynamic = 'force-dynamic';

const BASE_PATH = '/back-office/social';

const TABS = ['failed', 'queued', 'posted', 'dryrun', 'drafts', 'all'] as const;

const TAB_LABELS: Record<string, string> = {
  failed: 'Failed',
  queued: 'Queued',
  posted: 'Posted',
  dryrun: 'Dry run',
  drafts: 'Group drafts',
  all: 'All',
};

const PLATFORM_LABELS: Record<string, string> = {
  facebook_page: 'Facebook Page',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook_group: 'Facebook Group',
};

/** A post whose remote id says nothing was ever actually sent. */
const dryRunCondition = () =>
  like(listingSocialPosts.remotePostId, `${DRY_RUN_ID_PREFIX}%`);

function tabCondition(tab: string): SQL | undefined {
  switch (tab) {
    case 'failed':
      return eq(listingSocialPosts.status, 'failed');
    case 'queued':
      return inArray(listingSocialPosts.status, ['queued', 'running']);
    case 'posted':
      // "Posted" means actually sent. A dry run reports success without having
      // sent anything, so it is never counted here — it has its own tab.
      return and(eq(listingSocialPosts.status, 'posted'), not(dryRunCondition()));
    case 'dryrun':
      return dryRunCondition();
    case 'drafts':
      // Facebook Groups can never be automated (Meta removed the API in April
      // 2024), so these are a PERMANENT manual worklist, not a transient state.
      return eq(listingSocialPosts.platform, 'facebook_group');
    default:
      return undefined;
  }
}

function searchCondition(q: string): SQL | undefined {
  if (!q) return undefined;
  const clauses: SQL[] = [ilike(listings.title, `%${q}%`)];
  const asId = Number.parseInt(q.replace(/^#/, ''), 10);
  if (Number.isFinite(asId) && asId > 0) {
    clauses.push(eq(listingSocialPosts.listingId, asId));
  }
  return or(...clauses);
}

/** Distinct listings matching a post-level condition. */
async function countListings(condition: SQL | undefined): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(distinct ${listingSocialPosts.listingId})` })
    .from(listingSocialPosts)
    .leftJoin(listings, eq(listingSocialPosts.listingId, listings.id))
    .where(condition);
  return Number(rows[0]?.n ?? 0);
}

export default async function SocialPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requireBackOfficeAccess();
  await loadFeatureFlags(true);

  const params = parseListParams(await searchParams, {
    tabs: TABS,
    defaultTab: 'all',
  });

  /**
   * Posts that outlived their listing and are STILL on the platform.
   *
   * Deliberately unbounded and NEVER paginated: the whole point is that a post
   * stranded on Instagram three months ago must not scroll off the end of a
   * recent-activity list and be forgotten. The partial index (migration 0044)
   * makes this cheap, and a long list here is itself the signal — it means
   * nobody is working the queue.
   */
  const awaitingTakedown = await db
    .select({
      post: listingSocialPosts,
      listingTitle: listings.title,
      listingStatus: listings.status,
    })
    .from(listingSocialPosts)
    .leftJoin(listings, eq(listingSocialPosts.listingId, listings.id))
    .where(
      and(
        eq(listingSocialPosts.needsManualTakedown, true),
        isNull(listingSocialPosts.manualTakedownAt)
      )
    )
    // Oldest first: the most overdue is the most exposed.
    .orderBy(asc(listingSocialPosts.pulledAt));

  const enabled = isFeatureEnabled('enableSocialAutoPublish');
  // Never throws by contract — a health readout must not be able to take this
  // page down. Cached per instance for a minute.
  const health = await checkSocialCredentials();

  const search = searchCondition(params.q);
  const where = and(tabCondition(params.tab), search);

  const [counts, total, pageRows] = await Promise.all([
    Promise.all(
      TABS.map(async (tab) => [
        tab,
        await countListings(and(tabCondition(tab), search)),
      ] as const)
    ).then((entries) => Object.fromEntries(entries) as Record<string, number>),
    countListings(where),
    // Page over LISTINGS, not posts: the unit of work here is a listing, and a
    // page that cut a listing's platforms in half would be unreadable.
    db
      .select({
        listingId: listingSocialPosts.listingId,
        lastActivity: max(listingSocialPosts.createdAt),
      })
      .from(listingSocialPosts)
      .leftJoin(listings, eq(listingSocialPosts.listingId, listings.id))
      .where(where)
      .groupBy(listingSocialPosts.listingId)
      .orderBy(desc(max(listingSocialPosts.createdAt)))
      .limit(params.perPage)
      .offset(params.offset),
  ]);

  const listingIds = pageRows.map((r) => r.listingId);

  // Every post for the listings on this page — a group must show the whole
  // picture, not only the platforms that matched the filter.
  const rows = listingIds.length
    ? await db
        .select({
          post: listingSocialPosts,
          listingTitle: listings.title,
          listingStatus: listings.status,
        })
        .from(listingSocialPosts)
        .leftJoin(listings, eq(listingSocialPosts.listingId, listings.id))
        .where(inArray(listingSocialPosts.listingId, listingIds))
        .orderBy(desc(listingSocialPosts.createdAt))
    : [];

  const order = new Map(listingIds.map((id, i) => [id, i]));
  const groups = groupByListing(rows).sort(
    (a, b) => (order.get(a.listingId) ?? 0) - (order.get(b.listingId) ?? 0)
  );

  const failedCount = rows.filter(({ post }) => post.status === 'failed').length;

  const views: SocialGroupView[] = groups.map((group) => ({
    listingId: group.listingId,
    title: group.title,
    listingStatus: group.listingStatus,
    summary: group.summary,
    failed: group.failed,
    live: group.live,
    captions: group.captions,
    posts: group.posts.map((post) => ({
      id: post.id,
      platform: post.platform,
      status: post.status,
      remotePermalink: post.remotePermalink,
      remotePostId: post.remotePostId,
      caption: post.caption,
      attempts: post.attempts,
      error: post.error,
      postedAt: post.postedAt ? post.postedAt.toISOString() : null,
      // Resolved on the server: the adapter registry is not client code.
      supportsRemove: adapterFor(post.platform as SocialPlatform)?.supportsRemove ?? false,
      dryRun: isDryRunPost(post.remotePostId),
    })),
  }));

  const tabs = TABS.map((key) => ({
    key,
    label: TAB_LABELS[key],
    count: counts[key] ?? 0,
    urgent: key === 'failed',
  }));

  return (
    <section className="flex-1 p-4 lg:p-8">
      <PageHeader
        icon={Share2}
        title="Social"
        summary={`${(counts.all ?? 0).toLocaleString()} listings posted`}
        actions={failedCount > 0 ? <RetryAllFailed count={failedCount} /> : null}
      />

      {!enabled && (
        <AlarmBanner
          tone="caution"
          title="Social auto-publish is off"
        >
          <p>
            Nothing new is being queued or posted. Turn it on in{' '}
            <Link href="/back-office/settings" className="font-semibold underline">
              Settings
            </Link>
            .
          </p>
        </AlarmBanner>
      )}

      {/*
        The worklist, first on the page and never collapsed: an undeletable post
        that outlived its listing is the most time-sensitive thing here. The
        landlord has already removed the property and tenants are still seeing
        it on our accounts. `status = 'pulled'` cannot express this — it means
        "gone OR still up" — so this reads the explicit flag.
      */}
      {awaitingTakedown.length > 0 && (
        <AlarmBanner
          icon={EyeOff}
          title={`Still live on the platform — ${awaitingTakedown.length} to remove by hand`}
        >
          <p className="text-rose-900/80">
            These listings are no longer live on Easy Rent, but the post could not be deleted
            through an API and is <strong>still visible</strong>. Open the post, delete it on
            the platform, then confirm here — nothing else can close these off.
          </p>
          <div className="mt-2 divide-y divide-rose-200">
            {awaitingTakedown.map(({ post, listingTitle, listingStatus }) => (
              <div key={post.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-[7.5rem] rounded bg-white px-2 py-0.5 text-xs font-medium text-slate-700">
                  {PLATFORM_LABELS[post.platform] ?? post.platform}
                </span>
                <Link
                  href={`/dashboard/listings/${post.listingId}`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {listingTitle ?? `Listing #${post.listingId}`}
                </Link>
                <span className="font-mono text-xs text-slate-500">#{post.listingId}</span>
                {listingStatus && (
                  <span className="rounded bg-white px-2 py-0.5 text-xs text-slate-600">
                    listing {listingStatus}
                  </span>
                )}
                {post.pulledAt && (
                  <span className="text-xs font-medium text-rose-800">
                    up for {longAge(post.pulledAt)} since takedown
                  </span>
                )}
                {post.remotePermalink ? (
                  <a
                    href={post.remotePermalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-teal-700 hover:underline"
                  >
                    Open post <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  /* Instagram records a permalink on publish, but a post from
                     before that, or one whose permalink fetch failed, has none.
                     Say so rather than rendering a dead link. */
                  <span className="text-xs text-slate-500">
                    no permalink recorded — find it on the account
                  </span>
                )}
                <div className="ml-auto">
                  <ConfirmManualTakedown postId={post.id} />
                </div>
              </div>
            ))}
          </div>
        </AlarmBanner>
      )}

      {/* Collapsed by default: reference material, not a worklist. The takedown
          banner above is the thing that must always be open. */}
      <details className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm">
        <summary className="cursor-pointer list-none font-medium text-slate-700">
          Platform configuration &amp; what can be automated
        </summary>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {socialAdapters.map((adapter) => {
            const status = platformStatusLine(
              health[adapter.platform],
              isPlatformEnabled(adapter.platform)
            );
            const dot =
              status.tone === 'ok'
                ? 'bg-emerald-500'
                : status.tone === 'warn'
                  ? 'bg-amber-500'
                  : status.tone === 'bad'
                    ? 'bg-rose-500'
                    : 'bg-slate-300';
            return (
              <div key={adapter.platform} className="flex items-start gap-2">
                <span className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${dot}`} />
                <span className="shrink-0 font-medium text-slate-800">
                  {PLATFORM_LABELS[adapter.platform] ?? adapter.platform}
                </span>
                <span className="text-slate-500">{status.text}</span>
              </div>
            );
          })}
        </div>

        <div className="mt-3 space-y-1 border-t border-slate-200 pt-3 text-slate-700">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>
              Only <strong>Facebook Page</strong> posts can be deleted through the API. On{' '}
              <strong>Instagram</strong> and <strong>TikTok</strong>, &ldquo;Mark for
              removal&rdquo; records the decision and gives you the link — you still have to
              delete the post yourself.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>
              <strong>Facebook Groups</strong> cannot be posted to programmatically (Meta
              removed the Groups API in April 2024). Those rows are drafts: copy the caption,
              post it, then mark it done.
            </span>
          </p>
        </div>
      </details>

      <FilterBar
        basePath={BASE_PATH}
        params={params}
        tabs={tabs}
        searchPlaceholder="Search listing title, #id"
      />

      <ListSlab>
        {views.length === 0 ? (
          <EmptyState
            basePath={BASE_PATH}
            params={params}
            emptyMessage="Nothing queued yet. Posts appear here once a landlord agrees to share a published listing."
            filterLabel={params.tab === 'all' ? undefined : TAB_LABELS[params.tab]}
          />
        ) : (
          <SocialGroupList groups={views} />
        )}
        <Pager basePath={BASE_PATH} params={params} total={total} />
      </ListSlab>
    </section>
  );
}
