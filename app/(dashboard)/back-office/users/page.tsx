import { Suspense } from 'react';
import { Users } from 'lucide-react';
import { PageHeader } from '@/components/back-office/page-header';
import { type RawSearchParams } from '@/lib/back-office/list-params';
import { UsersList } from './users-list';
import { UsersListSkeleton } from './users-list-skeleton';

/*
 * NO `force-dynamic`, and NOTHING IS AWAITED IN THIS BODY — including
 * `searchParams`.
 *
 * Both are dynamic accesses: `requireBackOfficeAccess()` reads cookies, and in
 * Next 15 `searchParams` is a Promise whose await counts too. Under PPR React
 * postpones at the FIRST one, so either of them up here would postpone at the
 * page root and the prerendered shell would be 0 bytes — the whole reason
 * back-office clicks used to paint nothing until the server finished. See the
 * performance notes in CLAUDE.md.
 *
 * So the promise is passed DOWN unawaited and everything dynamic lives under
 * the boundary below.
 */
export const metadata = { title: 'Users' };

const BASE_PATH = '/back-office/users';

export default function BackOfficeUsersPage(props: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <div>
      <PageHeader icon={Users} title="Users" />
      <Suspense fallback={<UsersListSkeleton />}>
        <UsersList basePath={BASE_PATH} searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
