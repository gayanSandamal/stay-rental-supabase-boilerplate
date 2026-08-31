import Link from 'next/link';
import { and, count, desc, eq, ilike, inArray, isNull, lt, or, type SQL } from 'drizzle-orm';
import { requireBackOfficeAccess } from '@/lib/auth/back-office';
import { db } from '@/lib/db/drizzle';
import { listings } from '@/lib/db/schema';
import { ShieldCheck, EyeOff, Timer } from 'lucide-react';
import { parseManifest, parsePhotos } from '@/lib/images/manifest';
import { phase } from '@/lib/observability/phase-timer';
import { PageHeader } from '@/components/back-office/page-header';
import { AlarmBanner } from '@/components/back-office/alarm-banner';
import { FilterBar } from '@/components/back-office/filter-bar';
import { ListSlab } from '@/components/back-office/list-slab';
import { Pager } from '@/components/back-office/pager';
import { EmptyState } from '@/components/back-office/empty-state';
import {
  countsByKey,
  listHref,
  parseListParams,
  type RawSearchParams,
} from '@/lib/back-office/list-params';
import { ModerationList, type ModerationRow } from './moderation-list';

export const dynamic = 'force-dynamic';
/*
 * Fail in 60s rather than the platform default of 300. A back-office page
 * that hangs for five minutes is indistinguishable from a dead site to the
 * operator, and it burns a full function invocation to tell them nothing.
 */
export const maxDuration = 60;

const BASE_PATH = '/back-office/moderation';

const TABS = ['held', 'never_checked', 'queued', 'error', 'passed', 'all'] as const;

const TAB_LABELS: Record<string, string> = {
  held: 'Held',
  never_checked: 'Never checked',
  queued: 'Queued',
  error: 'Errored',
  passed: 'Passed',
  all: 'All',
};

/**
 * A listing the engine NEVER LOOKED AT. `moderation_status` defaults to
 * 'skipped' and the sweeper only claims 'queued', so a listing nobody enqueued
 * is never examined — and it is live. Four production listings went public
 * this way. This is its own condition, its own count and its own banner.
 */
const neverCheckedCondition = () =>
  and(
    eq(listings.moderationStatus, 'skipped'),
    inArray(listings.status, ['active', 'pending'])
  )!;

/** Queued for over half an hour means the sweeper is not draining. */
const STUCK_MINUTES = 30;
const stuckCondition = () =>
  and(
    eq(listings.moderationStatus, 'queued'),
    lt(listings.updatedAt, new Date(Date.now() - STUCK_MINUTES * 60 * 1000))
  )!;

function tabCondition(tab: string): SQL | undefined {
  switch (tab) {
    case 'held':
      return eq(listings.moderationStatus, 'held');
    case 'never_checked':
      return neverCheckedCondition();
    case 'queued':
      return inArray(listings.moderationStatus, ['queued', 'running']);
    case 'error':
      return eq(listings.moderationStatus, 'error');
    case 'passed':
      return eq(listings.moderationStatus, 'passed');
    default:
      return undefined;
  }
}

function searchCondition(q: string): SQL | undefined {
  if (!q) return undefined;
  const like = `%${q}%`;
  const clauses: SQL[] = [
    ilike(listings.title, like),
    ilike(listings.city, like),
    ilike(listings.moderationSummary, like),
  ];
  const asId = Number.parseInt(q.replace(/^#/, ''), 10);
  if (Number.isFinite(asId) && asId > 0) clauses.push(eq(listings.id, asId));
  return or(...clauses);
}

export default async function ModerationQueuePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requireBackOfficeAccess();

  const params = parseListParams(await searchParams, {
    tabs: TABS,
    defaultTab: 'held',
  });

  const [coverage, neverCheckedRows, stuckRows] = await phase('moderation:counts', () => Promise.all([
    db
      .select({ status: listings.moderationStatus, n: count() })
      .from(listings)
      .groupBy(listings.moderationStatus),
    db.select({ n: count() }).from(listings).where(neverCheckedCondition()),
    db.select({ n: count() }).from(listings).where(stuckCondition()),
  ]));

  const byStatus = countsByKey(coverage);
  // True aggregates. The old page derived `neverChecked.length` from a
  // `limit(50)` query, so past 50 the count under-reported its own severity.
  const neverChecked = Number(neverCheckedRows[0]?.n ?? 0);
  const stuck = Number(stuckRows[0]?.n ?? 0);

  const counts = {
    held: byStatus.held ?? 0,
    never_checked: neverChecked,
    queued: (byStatus.queued ?? 0) + (byStatus.running ?? 0),
    error: byStatus.error ?? 0,
    passed: byStatus.passed ?? 0,
    all: Object.values(byStatus).reduce((a, b) => a + b, 0),
  };

  const where = and(tabCondition(params.tab), searchCondition(params.q));

  const [rows, totalRows] = await phase('moderation:rows', () => Promise.all([
    db.query.listings.findMany({
      where,
      orderBy: [desc(listings.moderatedAt), desc(listings.createdAt)],
      limit: params.perPage,
      offset: params.offset,
    }),
    db.select({ n: count() }).from(listings).where(where),
  ]));

  const total = Number(totalRows[0]?.n ?? 0);

  const items: ModerationRow[] = rows.map((listing) => {
    const manifest = parseManifest(listing.photosManifest);
    return {
      id: listing.id,
      title: listing.title,
      city: listing.city,
      status: listing.status,
      moderationStatus: listing.moderationStatus,
      moderationLanguage: listing.moderationLanguage,
      moderationSummary: listing.moderationSummary,
      moderationAttempts: listing.moderationAttempts,
      // An I2 violation — a public photo no manifest entry accounts for — is a
      // bug worth seeing rather than a number worth hiding.
      publicCount: parsePhotos(listing.photos).length,
      trackedCount: manifest.length,
      photos: manifest.map((entry) => ({
        url: entry.o,
        verdict: entry.v,
        reason: entry.r ?? null,
      })),
    };
  });

  const tabs = TABS.map((key) => ({
    key,
    label: TAB_LABELS[key],
    count: counts[key],
    urgent: key === 'held' || key === 'never_checked',
  }));

  return (
    <section className="flex-1 p-4 lg:p-8">
      <PageHeader
        icon={ShieldCheck}
        title="Moderation"
        summary={`${counts.all.toLocaleString()} listings tracked`}
      />

      {/*
        TWO banners, never merged. A listing nobody enqueued and a queue nobody
        is draining are different failures with different fixes; hiding one
        behind the other loses the signal. Both counts are unbounded aggregates.
      */}
      {neverChecked > 0 && (
        <AlarmBanner
          icon={EyeOff}
          title={`${neverChecked} live or pending listing(s) have never been checked`}
        >
          <p>
            They were created before anything enqueued them, and they are public
            now. Nothing will pick them up on its own.{' '}
            <Link
              href={listHref(BASE_PATH, params, { tab: 'never_checked' })}
              className="font-semibold underline"
            >
              Re-queue them
            </Link>
          </p>
        </AlarmBanner>
      )}

      {stuck > 0 && (
        <AlarmBanner
          tone="caution"
          icon={Timer}
          title={`${stuck} listing(s) have been queued for over ${STUCK_MINUTES} minutes`}
        >
          <p>
            The sweeper may not be running — check the cron and{' '}
            <code className="font-mono">GET /api/cron/moderate-listings</code>&apos;s{' '}
            <code className="font-mono">imageToolchain</code>.{' '}
            <Link
              href={listHref(BASE_PATH, params, { tab: 'queued' })}
              className="font-semibold underline"
            >
              See the queue
            </Link>
          </p>
        </AlarmBanner>
      )}

      <FilterBar
        basePath={BASE_PATH}
        params={params}
        tabs={tabs}
        searchPlaceholder="Search title, city, summary, #id"
      />

      <ListSlab>
        {items.length === 0 ? (
          <EmptyState
            basePath={BASE_PATH}
            params={params}
            emptyMessage="Nothing needs attention. Listings appear here when the automated checks hold them, or while they are queued."
            filterLabel={params.tab === 'all' ? undefined : TAB_LABELS[params.tab]}
          />
        ) : (
          <ModerationList rows={items} />
        )}
        <Pager basePath={BASE_PATH} params={params} total={total} />
      </ListSlab>
    </section>
  );
}
