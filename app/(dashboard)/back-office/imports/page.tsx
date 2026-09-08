import { and, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Download, Plus } from 'lucide-react';
import { requireBackOfficeAccess } from '@/lib/auth/back-office';
import { db } from '@/lib/db/drizzle';
import { postImports } from '@/lib/db/schema';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { PageHeader } from '@/components/back-office/page-header';
import { FilterBar } from '@/components/back-office/filter-bar';
import { ListSlab } from '@/components/back-office/list-slab';
import { Pager } from '@/components/back-office/pager';
import { EmptyState } from '@/components/back-office/empty-state';
import { Button } from '@/components/ui/button';
import { parseListParams, type RawSearchParams } from '@/lib/back-office/list-params';
import { ImportList, type ImportRow } from './import-list';

/*
 * revalidate, NOT force-dynamic. This page gates on a feature flag, and the
 * flag snapshot is per-instance with a 30s TTL either way — force-dynamic buys
 * no extra freshness and costs the prerendered shell (see CLAUDE.md).
 */
export const revalidate = 30;
export const maxDuration = 60;

const BASE_PATH = '/back-office/imports';
const TABS = ['draft', 'published', 'discarded', 'all'] as const;

const TAB_LABELS: Record<string, string> = {
  draft: 'Awaiting review',
  published: 'Published',
  discarded: 'Discarded',
  all: 'All',
};

function tabCondition(tab: string): SQL | undefined {
  if (tab === 'all') return undefined;
  if (tab === 'draft') return eq(postImports.status, 'draft');
  if (tab === 'published') return eq(postImports.status, 'published');
  if (tab === 'discarded') return eq(postImports.status, 'discarded');
  return undefined;
}

function searchCondition(q: string): SQL | undefined {
  if (!q) return undefined;
  const like = `%${q}%`;
  const numeric = Number.parseInt(q.replace(/^#/, ''), 10);
  const clauses: SQL[] = [
    ilike(postImports.sourceUrl, like),
    ilike(postImports.rawText, like),
    ilike(postImports.ownerName, like),
    ilike(postImports.ownerPhone, like),
  ];
  if (Number.isFinite(numeric)) clauses.push(eq(postImports.id, numeric));
  return or(...clauses);
}

export default async function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requireBackOfficeAccess();
  const flags = await loadFeatureFlags();
  // A switched-off feature should not be a visible-but-broken screen.
  if (!flags.enableFacebookImport) notFound();

  const params = parseListParams(await searchParams, { tabs: TABS, defaultTab: 'draft' });

  // ONE aggregate for every tab count — never rows.length of a capped page,
  // and never two concurrent queries on a max: 1 pool.
  const [tallies] = await db
    .select({
      draft: sql<number>`count(*) filter (where ${postImports.status} = 'draft')`,
      published: sql<number>`count(*) filter (where ${postImports.status} = 'published')`,
      discarded: sql<number>`count(*) filter (where ${postImports.status} = 'discarded')`,
      all: sql<number>`count(*)`,
    })
    .from(postImports);

  const counts = {
    draft: Number(tallies?.draft ?? 0),
    published: Number(tallies?.published ?? 0),
    discarded: Number(tallies?.discarded ?? 0),
    all: Number(tallies?.all ?? 0),
  };

  const where = and(tabCondition(params.tab), searchCondition(params.q));

  const rows = await db.query.postImports.findMany({
    where,
    orderBy: [desc(postImports.createdAt)],
    limit: params.perPage,
    offset: params.offset,
  });
  const totalRows = await db.select({ n: count() }).from(postImports).where(where);
  const total = Number(totalRows[0]?.n ?? 0);

  const imports: ImportRow[] = rows.map((row) => ({
    id: row.id,
    sourceUrl: row.sourceUrl,
    sourcePlatform: row.sourcePlatform,
    resolvedVia: row.resolvedVia,
    status: row.status,
    ownerName: row.ownerName,
    ownerPhone: row.ownerPhone,
    listingId: row.listingId,
    notifyOutcome: row.notifyOutcome,
    title: titleOf(row.parsedPayload),
    photoCount: countOf(row.photoUrls),
    createdAt: row.createdAt.toISOString(),
  }));

  return (
    <section className="flex-1 p-4 lg:p-8">
      <PageHeader
        icon={Download}
        title="Imports"
        summary={`${counts.all.toLocaleString()} total`}
        actions={
          <Button asChild>
            <Link href={`${BASE_PATH}/new`}>
              <Plus className="mr-1.5 h-4 w-4" />
              Import a post
            </Link>
          </Button>
        }
      />

      <FilterBar
        basePath={BASE_PATH}
        params={params}
        tabs={TABS.map((key) => ({ key, label: TAB_LABELS[key], count: counts[key] }))}
        searchPlaceholder="Search URL, text, owner, #id"
      />

      <ListSlab>
        {imports.length === 0 ? (
          <EmptyState
            basePath={BASE_PATH}
            params={params}
            emptyMessage="Nothing imported yet. Paste a Facebook post URL to pull an ad in and review it before it publishes."
            filterLabel={params.tab === 'all' ? undefined : TAB_LABELS[params.tab]}
          />
        ) : (
          <ImportList rows={imports} />
        )}
        <Pager basePath={BASE_PATH} params={params} total={total} />
      </ListSlab>
    </section>
  );
}

function titleOf(raw: string | null): string | null {
  try {
    const parsed = JSON.parse(raw ?? 'null') as { title?: string | null } | null;
    return parsed?.title ?? null;
  } catch {
    return null;
  }
}

function countOf(raw: string | null): number {
  try {
    const value = JSON.parse(raw ?? '[]');
    return Array.isArray(value) ? value.length : 0;
  } catch {
    return 0;
  }
}
