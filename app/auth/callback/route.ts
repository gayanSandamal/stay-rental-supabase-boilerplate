import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * Auth callback route for Supabase PKCE flow.
 * Handles redirects from:
 * - Email confirmation (sign up)
 * - Password reset
 * - OAuth providers
 *
 * Supabase redirects here with ?code=xxx. We exchange the code for a session
 * (stored in cookies) and redirect to the intended page.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/sign-in';

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error) {
        return NextResponse.redirect(`${origin}${next.startsWith('/') ? next : `/${next}`}`);
      }
      console.error('[auth/callback] exchangeCodeForSession failed:', error);
    } catch (err) {
      console.error('[auth/callback] createClient or exchange failed:', err);
    }
  }

  // Code missing or exchange failed - redirect to sign-in with error
  return NextResponse.redirect(`${origin}/sign-in?error=auth_callback_failed`);
}
