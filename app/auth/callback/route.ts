import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';

/**
 * Auth callback route. Handles redirects from:
 * - Email confirmation (sign up)
 * - Self-service password reset (requestPasswordReset in app/(login)/actions.ts)
 * - OAuth providers
 * - Admin-generated links (auth.admin.generateLink, e.g. activating a no_auth
 *   back-office account) — see users-list.tsx / user-tabs.ts
 *
 * TWO DIFFERENT TOKEN SHAPES ARRIVE HERE, because they come from two different
 * origins:
 *
 * `?code=xxx` — the PKCE flow. The client that CALLED resetPasswordForEmail
 * (or signed up) set a code_verifier cookie at that moment; GoTrue's redirect
 * carries a matching code, and exchangeCodeForSession() pairs them.
 *
 * `?token_hash=xxx&type=yyy` — an out-of-band link, e.g. from
 * auth.admin.generateLink(). There is no originating browser and therefore no
 * code_verifier cookie to pair with, so GoTrue's own PKCE redirect can never
 * complete here — verifyOtp() checks the token_hash directly against GoTrue
 * instead. Build these links as `${baseUrl}/auth/callback?token_hash=<hashed_token
 * from generateLink>&type=recovery&next=/reset-password`, not by sending
 * users the raw `action_link` — that one redirects with the session in a URL
 * FRAGMENT (`#access_token=...`), which never reaches this server route at all.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/sign-in';
  const target = `${origin}${next.startsWith('/') ? next : `/${next}`}`;

  try {
    const supabase = await createClient();

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(target);
      console.error('[auth/callback] exchangeCodeForSession failed:', error);
    } else if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (!error) return NextResponse.redirect(target);
      console.error('[auth/callback] verifyOtp failed:', error);
    }
  } catch (err) {
    console.error('[auth/callback] createClient or verification failed:', err);
  }

  // Missing/invalid token, or verification failed - redirect to sign-in with error
  return NextResponse.redirect(`${origin}/sign-in?error=auth_callback_failed`);
}
