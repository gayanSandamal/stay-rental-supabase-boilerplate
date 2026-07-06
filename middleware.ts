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
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isProtectedRoute && !user) {
    return signInWithRedirect();
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
  runtime: 'nodejs'
};
