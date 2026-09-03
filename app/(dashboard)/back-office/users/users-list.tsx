import { requireBackOfficeAccess } from '@/lib/auth/back-office';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FilterBar } from '@/components/back-office/filter-bar';
import { ListSlab } from '@/components/back-office/list-slab';
import { Pager } from '@/components/back-office/pager';
import { EmptyState } from '@/components/back-office/empty-state';
import { parseListParams, type RawSearchParams } from '@/lib/back-office/list-params';
import { shortAge, fullTimestamp } from '@/lib/back-office/format';
import { publisherDisplayName } from '@/lib/publisher-name';
import {
  ACCOUNT_STATE_LABELS,
  USER_TABS,
  USER_TAB_LABELS,
  URGENT_USER_TABS,
  accountState,
  type UserTab,
} from '@/lib/back-office/user-tabs';
import {
  getBackOfficeUsers,
  getBackOfficeUserCounts,
} from '@/lib/back-office/users-query';
import { cn } from '@/lib/utils';

const STATE_STYLES: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-800',
  dormant: 'bg-slate-100 text-slate-600',
  // Rose, matching the urgent tab: this is a defect someone must repair, not a
  // quiet status.
  no_auth: 'bg-rose-100 text-rose-800',
  deleted: 'bg-slate-100 text-slate-500',
};

const ROLE_STYLES: Record<string, string> = {
  admin: 'bg-teal-700 text-white',
  ops: 'bg-teal-50 text-teal-900',
  landlord: 'bg-amber-50 text-amber-900',
  tenant: 'bg-slate-100 text-slate-700',
};

/**
 * Everything on the users page that needs the database or the signed-in
 * operator. Lives below a Suspense boundary so the page shell can prerender —
 * see the comment in page.tsx.
 */
export async function UsersList({
  basePath,
  searchParams,
}: {
  basePath: string;
  searchParams: Promise<RawSearchParams>;
}) {
  await requireBackOfficeAccess();

  const params = parseListParams(await searchParams, {
    tabs: USER_TABS,
    defaultTab: 'all',
  });

  // Sequential — max: 1 pool on the transaction pooler (CLAUDE.md, a3ac4f9).
  const { rows, total } = await getBackOfficeUsers({
    tab: params.tab as UserTab,
    q: params.q,
    limit: params.perPage,
    offset: params.offset,
  });
  const counts = await getBackOfficeUserCounts();

  const tabs = USER_TABS.map((key) => ({
    key,
    label: USER_TAB_LABELS[key],
    count: counts[key] ?? 0,
    urgent: URGENT_USER_TABS.has(key),
  }));

  return (
    <>
      <FilterBar
        basePath={basePath}
        params={params}
        tabs={tabs}
        searchPlaceholder="Search name, email, WhatsApp number or #id"
      />
      <ListSlab>
        {rows.length === 0 ? (
          <EmptyState
            basePath={basePath}
            params={params}
            emptyMessage="No users yet."
            filterLabel={
              params.tab === 'all' ? undefined : USER_TAB_LABELS[params.tab as UserTab]
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last sign-in</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((u) => {
                  const state = accountState(u);
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="font-medium text-slate-900">
                          {/*
                            publisherDisplayName keeps the synthetic
                            @wa.easyrent.lk address off the screen — it is an
                            internal auth artefact, not something anyone should
                            read or try to contact.
                          */}
                          {publisherDisplayName({ name: u.name, email: u.email })}
                        </div>
                        <div className="text-xs text-slate-500">
                          #{u.id}
                          {u.waPhone && (
                            <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">
                              WhatsApp verified
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-semibold',
                            ROLE_STYLES[u.role] ?? 'bg-slate-100 text-slate-700'
                          )}
                        >
                          {u.role}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-semibold',
                            STATE_STYLES[state]
                          )}
                        >
                          {ACCOUNT_STATE_LABELS[state]}
                        </span>
                        {state === 'no_auth' && (
                          <p className="mt-1 text-[11px] text-rose-700">
                            No Supabase Auth record — this account can never sign in.
                          </p>
                        )}
                      </TableCell>
                      <TableCell
                        className="text-sm text-slate-600"
                        title={u.lastSignInAt ? fullTimestamp(u.lastSignInAt) : undefined}
                      >
                        {u.lastSignInAt ? shortAge(u.lastSignInAt) : '—'}
                      </TableCell>
                      <TableCell
                        className="text-sm text-slate-600"
                        title={fullTimestamp(u.createdAt)}
                      >
                        {shortAge(u.createdAt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Pager basePath={basePath} params={params} total={total} />
          </>
        )}
      </ListSlab>
    </>
  );
}
