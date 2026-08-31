import { requireBackOfficeAccess } from '@/lib/auth/back-office';
import { db } from '@/lib/db/drizzle';
import { whatsappIntakes } from '@/lib/db/schema';
import { NEEDS_INFO_MAX_ROUNDS } from '@/lib/intake/accumulator';
import { and, asc, count, desc, eq, gte, ilike, lt, or, sql, type SQL } from 'drizzle-orm';
import { MessageCircle, UserRoundSearch } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/back-office/page-header';
import { AlarmBanner } from '@/components/back-office/alarm-banner';
import { FilterBar } from '@/components/back-office/filter-bar';
import { ListSlab } from '@/components/back-office/list-slab';
import { Pager } from '@/components/back-office/pager';
import { EmptyState } from '@/components/back-office/empty-state';
import {
  listHref,
  parseListParams,
  type RawSearchParams,
} from '@/lib/back-office/list-params';
import { phase } from '@/lib/observability/phase-timer';
import { IntakeList, type IntakeRow } from './intake-list';

export const dynamic = 'force-dynamic';
/*
 * Fail in 60s rather than the platform default of 300. A back-office page
 * that hangs for five minutes is indistinguishable from a dead site to the
 * operator, and it burns a full function invocation to tell them nothing.
 */
export const maxDuration = 60;

const BASE_PATH = '/back-office/whatsapp-intakes';

const TABS = ['needs_human', 'talking', 'published', 'rejected', 'all'] as const;

const TAB_LABELS: Record<string, string> = {
  needs_human: 'Needs a human',
  talking: 'In conversation',
  published: 'Published',
  rejected: 'Rejected',
  all: 'All',
};

/**
 * An intake the bot has given up on: it either failed outright, or we already
 * asked the landlord twice and the cap says a human takes over from here.
 * These are landlords ACTIVELY WAITING on a person.
 */
const pastCapCondition = () =>
  and(
    eq(whatsappIntakes.status, 'needs_info'),
    gte(whatsappIntakes.needsInfoRounds, NEEDS_INFO_MAX_ROUNDS)
  )!;

const needsHumanCondition = () =>
  or(eq(whatsappIntakes.status, 'manual_review'), pastCapCondition())!;

function tabCondition(tab: string): SQL | undefined {
  switch (tab) {
    case 'needs_human':
      return needsHumanCondition();
    case 'talking':
      return or(
        eq(whatsappIntakes.status, 'received'),
        and(
          eq(whatsappIntakes.status, 'needs_info'),
          lt(whatsappIntakes.needsInfoRounds, NEEDS_INFO_MAX_ROUNDS)
        )
      );
    case 'published':
      return eq(whatsappIntakes.status, 'published');
    case 'rejected':
      return eq(whatsappIntakes.status, 'rejected');
    default:
      return undefined;
  }
}

/** Phone number, profile name, message text, or an id typed as `12` / `#12`. */
function searchCondition(q: string): SQL | undefined {
  if (!q) return undefined;
  const like = `%${q}%`;
  const clauses: SQL[] = [
    ilike(whatsappIntakes.fromNumber, like),
    ilike(whatsappIntakes.profileName, like),
    ilike(whatsappIntakes.messageText, like),
  ];

  const asId = Number.parseInt(q.replace(/^#/, ''), 10);
  if (Number.isFinite(asId) && asId > 0) {
    clauses.push(eq(whatsappIntakes.id, asId));
    clauses.push(eq(whatsappIntakes.listingId, asId));
  }

  return or(...clauses);
}

function mediaCount(s: string | null): number {
  try {
    const v = JSON.parse(s ?? '[]');
    return Array.isArray(v) ? v.length : 0;
  } catch {
    return 0;
  }
}

function mediaUrls(s: string | null): string[] {
  try {
    const v = JSON.parse(s ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export default async function WhatsAppIntakesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requireBackOfficeAccess();

  const params = parseListParams(await searchParams, {
    tabs: TABS,
    defaultTab: 'needs_human',
  });

  /*
   * Counts come from aggregates over the WHOLE table, never from the length of
   * a capped page. The old screen derived its sense of volume from a
   * `limit(100)` list, so it under-reported exactly when the queue was worst.
   */
  /*
   * ONE query. Two concurrent ones deadlocked on Vercel, where the pool is
   * max: 1 and the connection is Supabase's transaction pooler — pipelining
   * onto a single PgBouncer-backed connection wedges the request until the
   * platform kills it.
   */
  const [tallies] = await phase('intakes:counts', () =>
    db
      .select({
        needsHuman: sql<number>`count(*) filter (where ${whatsappIntakes.status} = 'manual_review' or (${whatsappIntakes.status} = 'needs_info' and ${whatsappIntakes.needsInfoRounds} >= ${NEEDS_INFO_MAX_ROUNDS}))`,
        talking: sql<number>`count(*) filter (where ${whatsappIntakes.status} = 'received' or (${whatsappIntakes.status} = 'needs_info' and ${whatsappIntakes.needsInfoRounds} < ${NEEDS_INFO_MAX_ROUNDS}))`,
        published: sql<number>`count(*) filter (where ${whatsappIntakes.status} = 'published')`,
        rejected: sql<number>`count(*) filter (where ${whatsappIntakes.status} = 'rejected')`,
        all: sql<number>`count(*)`,
      })
      .from(whatsappIntakes)
  );

  const counts = {
    needs_human: Number(tallies?.needsHuman ?? 0),
    talking: Number(tallies?.talking ?? 0),
    published: Number(tallies?.published ?? 0),
    rejected: Number(tallies?.rejected ?? 0),
    all: Number(tallies?.all ?? 0),
  };

  const where = and(tabCondition(params.tab), searchCondition(params.q));

  // Oldest first where someone is waiting on us; newest first everywhere else.
  const orderBy =
    params.tab === 'needs_human'
      ? [asc(whatsappIntakes.lastMessageAt)]
      : [desc(whatsappIntakes.lastMessageAt)];

  const rows = await phase('intakes:rows', () =>
    db.query.whatsappIntakes.findMany({
      where,
      orderBy,
      limit: params.perPage,
      offset: params.offset,
    })
  );
  const totalRows = await phase('intakes:total', () =>
    db.select({ n: count() }).from(whatsappIntakes).where(where)
  );

  const total = Number(totalRows[0]?.n ?? 0);

  const intakes: IntakeRow[] = rows.map((intake) => ({
    id: intake.id,
    status: intake.status,
    channel: intake.channel,
    profileName: intake.profileName,
    fromNumber: intake.fromNumber,
    messageText: intake.messageText,
    failureReason: intake.failureReason,
    listingId: intake.listingId,
    photoCount: mediaCount(intake.mediaPaths),
    photos: mediaUrls(intake.mediaPaths).slice(0, 12),
    needsInfoRounds: intake.needsInfoRounds,
    askedFields: intake.askedFields,
    hasUnsupportedMedia: intake.hasUnsupportedMedia,
    replyLanguage: intake.replyLanguage,
    lastMessageAt: intake.lastMessageAt.toISOString(),
  }));

  const tabs = TABS.map((key) => ({
    key,
    label: TAB_LABELS[key],
    count: counts[key],
    urgent: key === 'needs_human',
  }));

  return (
    <section className="flex-1 p-4 lg:p-8">
      <PageHeader
        icon={MessageCircle}
        title="WhatsApp Intakes"
        summary={`${counts.all.toLocaleString()} total`}
      />

      {/*
        The alarm zone. The count is a true aggregate, so it can never be capped
        into looking smaller than it is, and the tab it links to reaches every
        one of them.
      */}
      {counts.needs_human > 0 && params.tab !== 'needs_human' && (
        <AlarmBanner
          icon={UserRoundSearch}
          title={`${counts.needs_human} landlord${counts.needs_human === 1 ? ' is' : 's are'} waiting on a person`}
        >
          <p>
            These either failed processing outright, or we already asked{' '}
            {NEEDS_INFO_MAX_ROUNDS} times and the cap says a human takes over.
            Nobody is replying to them automatically.{' '}
            <Link
              href={listHref(BASE_PATH, params, { tab: 'needs_human' })}
              className="font-semibold underline"
            >
              Work them now
            </Link>
          </p>
        </AlarmBanner>
      )}

      <FilterBar
        basePath={BASE_PATH}
        params={params}
        tabs={tabs}
        searchPlaceholder="Search number, name, message, #id"
      />

      <ListSlab>
        {intakes.length === 0 ? (
          <EmptyState
            basePath={BASE_PATH}
            params={params}
            emptyMessage="No WhatsApp submissions yet. When landlords message the concierge number, their submissions appear here."
            filterLabel={params.tab === 'all' ? undefined : TAB_LABELS[params.tab]}
          />
        ) : (
          <IntakeList rows={intakes} />
        )}
        <Pager basePath={BASE_PATH} params={params} total={total} />
      </ListSlab>
    </section>
  );
}
