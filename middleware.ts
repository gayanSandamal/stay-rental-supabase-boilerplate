import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isReservedSlug } from '@/lib/reserved-slugs';
import {
  getKnownRoutes,
  listingIsMissing,
  landlordIsMissing,
} from '@/lib/seo/known-routes';
import { eligibleAreasOrNull } from '@/lib/seo/area-eligibility';

const protectedRoutes = '/dashboard';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

/**
 * The one route that may still be called while impersonating: the way out.
 * Without this exemption the Exit button would be blocked by the very rule it
 * exists to lift, and the only escape would be deleting a cookie by hand.
 */
const IMPERSONATION_EXIT_PATH = '/api/impersonation/exit';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtectedRoute = pathname.startsWith(protectedRoutes);

  /*
   * IMPERSONATION IS READ-ONLY, AND THIS IS WHERE THAT IS TRUE.
   *
   * Every request passes through here, so it is the one chokepoint that covers
   * API routes AND server actions (which are POSTs) without depending on 70
   * call sites each remembering to check. A safe method is allowed; everything
   * else is refused before it can reach code that writes.
   *
   * The check is deliberately on cookie PRESENCE, not validity. Validating here
   * would mean a database round trip on every request in the app, and it is not
   * needed: refusing a write for someone holding a forged or expired cookie is
   * the correct outcome anyway, and `getUser()` is what decides whether the
   * session actually grants anything.
   *
   * This is what keeps the audit trail honest. If a write got through while
   * impersonating, `logAudit` would record the SUBJECT as the actor — a false
   * statement in the one table everything else is checked against.
   */
  const isSafeMethod = request.method === 'GET' || request.method === 'HEAD';
  if (
    !isSafeMethod &&
    pathname !== IMPERSONATION_EXIT_PATH &&
    request.cookies.has('er_impersonate')
  ) {
    return NextResponse.json(
      {
        error:
          'This session is impersonating another user and is read-only. Exit impersonation to make changes.',
      },
      { status: 403 }
    );
  }

  /*
   * Answer unknown URLs with a real 404, before the auth round trip.
   *
   * The root `[slug]` catch-all matches every path, so without this every
   * mistyped or probed URL on the site returned HTTP 200 (measured on prod
   * 2026-09-07). The status cannot be fixed inside the page: under PPR the
   * shell is flushed — committing 200 — before `notFound()` runs in the
   * Suspense child, and both ways of forcing the check earlier (force-dynamic,
   * or awaiting above the boundary) cost the page its prerendered shell.
   *
   * GET/HEAD only. A POST to an unknown path is a server action or a form, not
   * something a crawler will ever see, and answering it with a 404 page would
   * break error handling that expects a JSON body.
   */
  if (isSafeMethod && !hasAuthCookie(request)) {
    const missing = await isMissingRoute(pathname);
    if (missing) {
      return new NextResponse(NOT_FOUND_HTML, {
        status: 404,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          // Belt and braces: a 404 is already not indexed, but this also covers
          // crawlers that render before reading the status line.
          'x-robots-tag': 'noindex',
          // Short, not immutable — a listing can come back, and a landlord can
          // claim the slug that 404s today.
          'cache-control': 'public, max-age=0, s-maxage=60, must-revalidate',
        },
      });
    }
  }

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

/**
 * Does this request carry a Supabase session at all?
 *
 * THE 404 CHECK MUST NOT RUN FOR SIGNED-IN USERS. A landlord may legitimately
 * open their own `pending`, `rented` or `rejected` listing, and ops/admin can
 * open anyone's — `/listings/[id]` renders exactly that, and only calls
 * `notFound()` for anonymous visitors. The snapshot holds ACTIVE listings only,
 * so 404ing before auth would take the owner's own preview away from them.
 *
 * Presence, not validity: an expired or forged cookie simply means the request
 * falls through to render, and `getUser()` decides what it actually grants. The
 * cost of being wrong here is a soft 200 for one signed-in visitor — never a
 * wrongly-404'd page, and never anything a crawler sees, since crawlers are
 * always anonymous.
 */
function hasAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'));
}

/**
 * Can we PROVE this path does not exist?
 *
 * Deliberately conservative: only the two namespaces the root catch-all made
 * unbounded are checked, and anything we cannot prove missing is allowed
 * through to render as before. A wrong 404 is far more expensive than a wrong
 * 200 — it de-indexes a real page.
 */
async function isMissingRoute(pathname: string): Promise<boolean> {
  const segments = pathname.split('/').filter(Boolean);

  const isListingDetail = segments.length === 2 && segments[0] === 'listings';
  const isAreaPage = segments.length === 2 && segments[0] === 'rentals';
  const isRootSlug = segments.length === 1;
  if (!isListingDetail && !isAreaPage && !isRootSlug) return false;

  /*
   * Area pages exist only above an inventory threshold, and the page itself
   * calls notFound() below a Suspense boundary — which under PPR lands after
   * the shell has already committed a 200. Measured on production 2026-09-07:
   * /rentals/nowhere returned 200 (noindex, so nothing was indexed, but every
   * probe still burned crawl budget and logged a soft 404).
   *
   * Same oracle the page uses, so the two can never disagree.
   */
  if (isAreaPage) {
    const areas = await eligibleAreasOrNull();
    // Never loaded — cannot tell, so do not guess. A database blip must not
    // 404 every valid area page.
    if (!areas) return false;
    return !areas.some((a) => a.slug === segments[1]);
  }

  // Real routes and everything reserved against them resolve normally.
  if (isRootSlug && isReservedSlug(segments[0])) return false;

  const snap = await getKnownRoutes();
  // Snapshot unavailable (cold instance mid-load, or a database blip) — we
  // cannot tell, so we do not guess. See getKnownRoutes.
  if (!snap) return false;

  if (isListingDetail) return await listingIsMissing(snap, segments[1]);

  /*
   * A vanity slug claimed within the last TTL is not in the snapshot yet, so it
   * 404s for up to a minute. Accepted deliberately: the alternative is a
   * database lookup for every unknown root path, which hands any bot walking
   * /wp-admin, /.env and friends a query each on a `max: 1` pool. Claiming a
   * slug is rare and never time-critical; being probed is constant.
   */
  return landlordIsMissing(snap, segments[0]);
}

/**
 * Standalone 404 body.
 *
 * Middleware cannot render a React page, and rewriting to one would hand the
 * status back to the renderer — which is the very thing that produced the soft
 * 200s. So this is deliberately self-contained: no CSS bundle, no fonts, no
 * JavaScript, nothing that can fail. It is what a crawler and a mistyped URL
 * get; every real page still renders through the app as normal.
 */
const NOT_FOUND_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Page not found | Easy Rent</title>
<style>
:root{color-scheme:light}
body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;background:#F7F4ED;color:#1F2933;font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:32rem;padding:2rem;text-align:center}
h1{margin:0 0 .5rem;font-size:1.5rem;color:#062C2B}
p{margin:0 0 1.5rem;color:#52606D}
a{display:inline-block;margin:0 .25rem;padding:.65rem 1.15rem;border-radius:.75rem;text-decoration:none;font-weight:600;font-size:.9rem}
.primary{background:#0A3F3D;color:#fff}
.secondary{border:1px solid #d6d3ca;color:#1F2933}
</style>
</head>
<body>
<main>
<h1>Page not found</h1>
<p>The listing may have been rented or removed, or the link may be mistyped.</p>
<a class="primary" href="/listings">Browse rentals</a>
<a class="secondary" href="/">Go home</a>
</main>
</body>
</html>`;

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
