import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const protectedRoutes = '/dashboard';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtectedRoute = pathname.startsWith(protectedRoutes);

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Preserve the intended destination so sign-in/sign-up can bounce back
  // (e.g. anonymous visitor clicking "List in 60 seconds" → quick-list form).
  const signInWithRedirect = () => {
    const signIn = new URL('/sign-in', request.url);
    signIn.searchParams.set('redirect', pathname + request.nextUrl.search);
    return NextResponse.redirect(signIn);
  };

  if (!supabaseUrl || !supabaseKey) {
    if (isProtectedRoute) {
      return signInWithRedirect();
    }
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        /*
         * The REQUEST cookies must be updated too, not just the response.
         *
         * Refreshing ROTATES the refresh token: the old one is invalidated the
         * moment a new one is issued. Writing only to `response` meant the
         * refreshed token went to the browser while every Server Component
         * downstream still read the OLD token off the unchanged request — then
         * tried to refresh with it and got `Invalid Refresh Token: Refresh
         * Token Not Found`. A Server Component cannot set cookies, so it could
         * never persist a fix; it just retried, and the request hung until the
         * platform killed it at 300s.
         *
         * Rebuilding `response` from the mutated request is what hands the
         * fresh token forward within this same request.
         */
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  /*
   * Bounded: this runs on every non-asset request (see matcher), so an
   * unbounded hang here takes down the whole site, not one page. On timeout we
   * fall through as anonymous rather than hanging — a protected route then
   * redirects to sign-in, which is a recoverable outcome.
   */
  let user = null;
  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('middleware auth.getUser exceeded 8000ms')), 8000)
      ),
    ]);
    user = result.data.user;
  } catch (err) {
    console.error('[middleware] auth lookup failed or timed out:', err);
  }

  if (isProtectedRoute && !user) {
    return signInWithRedirect();
  }

  return response;
}

export const config = {
  /*
   * `l/` (with the slash, so /listings and /list-your-property are unaffected)
   * is excluded: the access-link route writes session cookies itself, and
   * middleware refreshing them in parallel would race it.
   *
   * THE FILE-EXTENSION CLAUSE IS NOT COSMETIC. This middleware makes a real
   * HTTPS round trip to Supabase auth on every request it matches, before it
   * even looks at whether the route needs auth. Without that clause the matcher
   * caught everything under /public — `/easy-rent-logo.png`, the five files in
   * `/brand`, `/robots.txt`, `/sitemap.xml`, `/manifest.json` — so a single page
   * view spent half a dozen extra auth round trips authenticating pictures of a
   * logo. `_next/static` and `_next/image` were already excluded, which is why
   * this went unnoticed: the bundled assets were fine and only the hand-placed
   * ones in /public paid.
   */
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|l/|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|txt|xml|json|webmanifest|woff|woff2|ttf|otf|map)$).*)',
  ],
  runtime: 'nodejs',
};
