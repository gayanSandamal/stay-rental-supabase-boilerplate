import { getUser } from '@/lib/db/queries';

/**
 * Refuse a write when the caller is impersonating.
 *
 * DEFENCE IN DEPTH, NOT THE PRIMARY GUARD. Middleware already blocks every
 * non-GET request that carries the impersonation cookie, which covers API
 * routes and server actions alike. This exists for the paths middleware cannot
 * see — anything invoked outside a request, or a future runtime where the
 * matcher does not apply — and so that a server action reads as safe on its own
 * without the reader having to know the middleware exists.
 *
 * Throws rather than returning a flag: a write guard that can be ignored by
 * forgetting to check its result is not a guard.
 */
export async function assertNotImpersonating(): Promise<void> {
  const user = await getUser();
  if (user?.impersonatedBy) {
    throw new Error(
      'This session is impersonating another user and is read-only. Exit impersonation to make changes.'
    );
  }
}
