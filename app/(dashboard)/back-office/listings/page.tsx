import { db } from '@/lib/db/drizzle';
import { businessAccounts, listings } from '@/lib/db/schema';
import { and, count, desc, eq, ilike, isNotNull, or, type SQL } from 'drizzle-orm';
import { requireBackOfficeAccess } from '@/lib/auth/back-office';
import Link from 'next/link';
import { Eye, List } from 'lucide-react';
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

/** This screen has always been scoped to business-account listings. */
const scopeCondition = () => isNotNull(listings.businessAccountId);

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
    extraKeys: ['businessAccountId'],
  });

  const businessAccountId = Number.parseInt(params.extras.businessAccountId ?? '', 10);
  const accountCondition = Number.isFinite(businessAccountId)
    ? eq(listings.businessAccountId, businessAccountId)
    : undefined;

  const baseWhere = and(scopeCondition(), accountCondition);

  const where = and(
    baseWhere,
    params.tab === 'all' ? undefined : eq(listings.status, params.tab as 'active'),
    searchCondition(params.q)
  );

  /*
   * This page previously had NO limit at all — it selected every
   * business-account listing ever created, on every load, and rendered each one
   * as a full card. That degrades until it times out; it is the one item here
   * that was a live bug rather than a scaling concern.
   */
  const [rows, totalRows, statusCounts, account] = await Promise.all([
    db
      .select()
      .from(listings)
      .where(where)
      .orderBy(desc(listings.createdAt))
      .limit(params.perPage)
      .offset(params.offset),
    db.select({ n: count() }).from(listings).where(where),
    db
      .select({ status: listings.status, n: count() })
      .from(listings)
      .where(baseWhere)
      .groupBy(listings.status),
    Number.isFinite(businessAccountId)
      ? db
          .select({ name: businessAccounts.name })
          .from(businessAccounts)
          .where(eq(businessAccounts.id, businessAccountId))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const total = Number(totalRows[0]?.n ?? 0);
  const counts = countsByKey(statusCounts);
  const allCount = Object.values(counts).reduce((a, b) => a + b, 0);

  const tabs = TABS.map((key) => ({
    key,
    label: TAB_LABELS[key],
    count: key === 'all' ? allCount : (counts[key] ?? 0),
  }));

  const accountName = account[0]?.name;

  return (
    <section className="flex-1 p-4 lg:p-8">
      <PageHeader
        icon={List}
        title="Business Account Listings"
        summary={`${allCount.toLocaleString()} total`}
        actions={
          Number.isFinite(businessAccountId) ? (
            <Button asChild variant="outline" size="sm">
              <Link href={BASE_PATH}>View all accounts</Link>
            </Button>
          ) : null
        }
      />

      {accountName && (
        <p className="mb-3 text-sm text-slate-600">
          Filtered to <span className="font-semibold text-slate-900">{accountName}</span>
        </p>
      )}

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
            emptyMessage="No business account listings found."
            filterLabel={params.tab === 'all' ? undefined : TAB_LABELS[params.tab]}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-16">ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="w-48">Location</TableHead>
                <TableHead className="w-16 text-right">Age</TableHead>
                <TableHead className="w-20 text-right">View</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((listing) => (
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
                  <TableCell className="text-right">
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
