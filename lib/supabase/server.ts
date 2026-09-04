import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';

export async function createClient() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Set them in .env for Supabase Auth.'
    );
  }

  /*
   * THE COOKIES ARE READ HERE, EAGERLY, AND THAT IS THE WHOLE POINT.
   *
   * Under PPR, the first read of a cookie during a prerender does not return a
   * value — React throws a `postpone` object to mark where the static shell
   * ends and the dynamic hole begins. Next says it plainly in the error text:
   * "It should not be caught by your own try/catch."
   *
   * Left lazy, that read happened inside `supabase.auth.getUser()`, which is:
   *   1. wrapped in a try/catch by every caller that wants to fail closed
   *      rather than hang (see getUser in lib/db/queries.ts), and
   *   2. several promise chains deep inside supabase-js's own session lock,
   *      where a throw becomes a floating rejected promise nobody awaits.
   *
   * Production ran into exactly that on 2026-09-04:
   *
   *   GET /listings/31 504
   *     Unhandled Rejection: Error: Route /listings/[id] needs to bail out of
   *     prerendering at this point because it used cookies. … It should not be
   *     caught by your own try/catch.
   *
   * — a `Symbol(react.postpone)` that got away from React instead of marking
   * the boundary dynamic. (The 300s timeouts on that deployment had a second,
   * separate cause; see the idle_timeout note in lib/db/drizzle.ts. This is the
   * correctness half, that one is the hang.)
   *
   * Reading once here puts the postpone in OUR frame, outside any try/catch and
   * outside supabase-js, where React can see it. The adapter below then only
   * ever reads an already-resolved store.
   */
  cookieStore.getAll();

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch (err) {
          // A Server Component cannot set cookies; middleware handles refresh.
          // But redirect/notFound/postpone travel as thrown objects too, and
          // swallowing one of those is the bug documented above.
          unstable_rethrow(err);
        }
      },
    },
  });
}
