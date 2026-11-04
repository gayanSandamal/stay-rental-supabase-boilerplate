import { db } from '@/lib/db/drizzle';
import { importOriginsFor } from '@/lib/imports/origin';
import { ImportOriginBadge } from '@/components/back-office/import-origin-badge';
import { businessAccounts, landlords, listings, users } from '@/lib/db/schema';
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { publisherDisplayName } from '@/lib/publisher-name';
import {
  LISTING_SOURCES,
  LISTING_SOURCE_LABELS,
  isListingSource,
  sourceColumn,
  sourceCondition,
  type ListingSource,
} from '@/lib/back-office/listing-source';
import { requireBackOfficeAccess } from '@/lib/auth/back-office';
import Link from 'next/link';
import { Eye, List, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader } from '@/components/back-office/page-header';
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
import { shortAge, fullTimestamp } from '@/lib/back-office/format';

export const dynamic = 'force-dynamic';
/*
 * Fail in 60s rather than the platform default of 300. A back-office page
 * that hangs for five minutes is indistinguishable from a dead site to the
 * operator, and it burns a full function invocation to tell them nothing.
 */
export const maxDuration = 60;

const BASE_PATH = '/back-office/listings';

const TABS = [
  'all',
  'pending',
  'active',
  'rented',
  'expired',
  'archived',
  'rejected',
] as const;

const TAB_LABELS: Record<string, string> = {
  all: 'All',
  pending: 'Pending',
  active: 'Active',
  rented: 'Rented',
  expired: 'Expired',
  archived: 'Archived',
  rejected: 'Rejected',
};

/*
 * Every listing on the platform. This screen used to be scoped to
 * `business_account_id IS NOT NULL` — titled "Business Account Listings" but
 * linked from the sidebar as "Listings" — so with no agency accounts in use it
 * was permanently empty, and the back office had no all-listings view at all.
 * Business-account listings are now one Source filter among four, and the
 * `?businessAccountId=` deep link from a business account still narrows to it.
 */
const SOURCE_BADGE: Record<ListingSource, string> = {
  direct: 'bg-slate-100 text-slate-700',
  business: 'bg-indigo-50 text-indigo-700',
  whatsapp: 'bg-emerald-50 text-emerald-700',
  imported: 'bg-amber-50 text-amber-800',
};

function searchCondition(q: string): SQL | undefined {
  if (!q) return undefined;
  const like = `%${q}%`;
  const clauses: SQL[] = [
    ilike(listings.title, like),
    ilike(listings.city, like),
    ilike(listings.address, like),
  ];
  const asId = Number.parseInt(q.replace(/^#/, ''), 10);
  if (Number.isFinite(asId) && asId > 0) clauses.push(eq(listings.id, asId));
  return or(...clauses);
}

export default async function BackOfficeListingsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requireBackOfficeAccess();

  const params = parseListParams(await searchParams, {
    tabs: TABS,
    defaultTab: 'all',
    extraKeys: ['businessAccountId', 'source'],
  });

  const businessAccountId = Number.parseInt(params.extras.businessAccountId ?? '', 10);
  const accountCondition = Number.isFinite(businessAccountId)
    ? eq(listings.businessAccountId, businessAccountId)
    : undefined;

  const source = isListingSource(params.extras.source) ? params.extras.source : null;
  const sourceWhere = source ? sourceCondition(source) : undefined;
  const statusWhere = params.tab === 'all' ? undefined : eq(listings.status, params.tab as 'active');
  const search = searchCondition(params.q);

  // Status tab counts honour the account + source filters; source chip counts
  // honour the account + status filters. Each set of counts therefore matches
  // exactly what clicking it would show.
  const baseWhere = and(accountCondition, sourceWhere);
  const where = and(baseWhere, statusWhere, search);
  const sourceCountWhere = and(accountCondition, statusWhere, search);

  /*
   * This page previously had NO limit at all — it selected every
   * business-account listing ever created, on every load, and rendered each one
   * as a full card. That degrades until it times out; it is the one item here
   * that was a live bug rather than a scaling concern.
   */
  /*
   * Sequential, never concurrent: on Vercel the pool is max: 1 against
   * Supabase's transaction pooler, and pipelining concurrent queries onto one
   * PgBouncer-backed connection wedges the request until the platform kills it.
   * With a single connection they serialise anyway, so nothing is lost.
   */
  const rows = await db
    .select({
      listing: listings,
      source: sourceColumn,
      ownerName: users.name,
      ownerEmail: users.email,
      businessName: businessAccounts.name,
    })
    .from(listings)
    .leftJoin(landlords, eq(landlords.id, listings.landlordId))
    .leftJoin(users, eq(users.id, landlords.userId))
    .leftJoin(businessAccounts, eq(businessAccounts.id, listings.businessAccountId))
    .where(where)
    .orderBy(desc(listings.createdAt))
    .limit(params.perPage)
    .offset(params.offset);
  const totalRows = await db.select({ n: count() }).from(listings).where(where);
  const statusCounts = await db
    .select({ status: listings.status, n: count() })
    .from(listings)
    .where(baseWhere)
    .groupBy(listings.status);
  const sourceCounts = await db
    .select({ source: sourceColumn, n: count() })
    .from(listings)
    .where(sourceCountWhere)
    .groupBy(sourceColumn);
  const account = Number.isFinite(businessAccountId)
    ? await db
        .select({ name: businessAccounts.name })
        .from(businessAccounts)
        .where(eq(businessAccounts.id, businessAccountId))
        .limit(1)
    : [];

  const total = Number(totalRows[0]?.n ?? 0);

  // One batched lookup for the page — never one per row.
  const origins = await importOriginsFor(rows.map((r) => r.listing.id));
  const counts = countsByKey(statusCounts);
  const allCount = Object.values(counts).reduce((a, b) => a + b, 0);

  const tabs = TABS.map((key) => ({
    key,
    label: TAB_LABELS[key],
    count: key === 'all' ? allCount : (counts[key] ?? 0),
  }));

  const accountName = account[0]?.name;
  const bySource = new Map(sourceCounts.map((r) => [r.source, Number(r.n)]));
  const sourceTotal = sourceCounts.reduce((a, r) => a + Number(r.n), 0);
  const sourceChips: { key: ListingSource | null; label: string; n: number }[] = [
    { key: null, label: 'All sources', n: sourceTotal },
    ...LISTING_SOURCES.map((key) => ({ key, label: LISTING_SOURCE_LABELS[key], n: bySource.get(key) ?? 0 })),
  ];
  const sourceHref = (key: ListingSource | null) => {
    const extras = { ...params.extras };
    if (key) extras.source = key;
    else delete extras.source;
    return listHref(BASE_PATH, params, { extras, page: 1 });
  };

  return (
    <section className="flex-1 p-4 lg:p-8">
      <PageHeader
        icon={List}
        title="Listings"
        summary={`${allCount.toLocaleString()} total`}
        actions={
          Number.isFinite(businessAccountId) ? (
            <Button asChild variant="outline" size="sm">
              <Link href={sourceHref(source)}>Clear account filter</Link>
            </Button>
          ) : null
        }
      />

      {accountName && (
        <p className="mb-3 text-sm text-slate-600">
          Filtered to <span className="font-semibold text-slate-900">{accountName}</span>
        </p>
      )}

      <nav aria-label="Filter by source" className="mb-3 flex flex-wrap gap-2">
        {sourceChips.map((chip) => {
          const active = chip.key === source;
          return (
            <Link
              key={chip.key ?? 'all'}
              href={sourceHref(chip.key)}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? 'border-teal-700 bg-teal-700 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {chip.label}
              <span className={`tabular-nums ${active ? 'text-teal-100' : 'text-slate-400'}`}>{chip.n}</span>
            </Link>
          );
        })}
      </nav>

      <FilterBar
        basePath={BASE_PATH}
        params={params}
        tabs={tabs}
        searchPlaceholder="Search title, city, address, #id"
      />

      <ListSlab>
        {rows.length === 0 ? (
          <EmptyState
            basePath={BASE_PATH}
            params={params}
            emptyMessage={
              source ? `No ${LISTING_SOURCE_LABELS[source].toLowerCase()} listings found.` : 'No listings found.'
            }
            filterLabel={params.tab === 'all' ? undefined : TAB_LABELS[params.tab]}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-16">ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="w-48">Owner</TableHead>
                <TableHead className="w-32">Source</TableHead>
                <TableHead className="w-40">Location</TableHead>
                <TableHead className="w-16 text-right">Age</TableHead>
                <TableHead className="w-28 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ listing, source: rowSource, ownerName, ownerEmail, businessName }) => (
                <TableRow key={listing.id}>
                  <TableCell>
                    <StatusBadge status={listing.status} />
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-500 tabular-nums">
                    #{listing.id}
                  </TableCell>
                  <TableCell className="max-w-0">
                    <Link
                      href={`/dashboard/listings/${listing.id}`}
                      className="block truncate text-sm font-semibold text-slate-900 hover:underline"
                    >
                      {listing.title}
                    </Link>
                    {origins.get(listing.id) && (
                      <div className="mt-1">
                        <ImportOriginBadge origin={origins.get(listing.id)!} />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="max-w-0 truncate text-[13px] text-slate-700">
                    {/* Business name, else the landlord — never a synthetic
                        @wa.easyrent.lk address (publisherDisplayName). The
                        concierge's recorded owner name wins for WhatsApp
                        listings held under the Operations identity. */}
                    {businessName ??
                      listing.sourceContactName ??
                      publisherDisplayName({ name: ownerName, email: ownerEmail })}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${SOURCE_BADGE[rowSource]}`}
                    >
                      {LISTING_SOURCE_LABELS[rowSource]}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-0 truncate text-[13px] text-slate-600">
                    {listing.address ?? listing.city}
                  </TableCell>
                  <TableCell
                    className="text-right text-xs text-slate-500 tabular-nums"
                    title={fullTimestamp(listing.createdAt)}
                  >
                    {shortAge(listing.createdAt)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {/* Only an ACTIVE listing can be posted — TikTok would be
                        sent a URL that 404s otherwise, and publishNow refuses
                        it anyway. Hiding the link beats offering a dead end. */}
                    {listing.status === 'active' && (
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/back-office/social/post/${listing.id}`}>
                          <Share2 className="h-4 w-4" />
                          <span className="sr-only">
                            Review and post listing {listing.id} to TikTok
                          </span>
                        </Link>
                      </Button>
                    )}
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/listings/${listing.id}`} target="_blank">
                        <Eye className="h-4 w-4" />
                        <span className="sr-only">View listing {listing.id} on the site</span>
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pager basePath={BASE_PATH} params={params} total={total} />
      </ListSlab>
    </section>
  );
}
