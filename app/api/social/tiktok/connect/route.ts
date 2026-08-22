import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { requireBackOfficeAccess } from '@/lib/auth/back-office';
import { baseUrl, socialConfig } from '@/lib/social/config';

/**
 * Start the TikTok OAuth flow for Easy Rent's OWN brand account.
 *
 * This is a one-time admin action, not a per-landlord flow — we post to our
 * account, never theirs. Gated behind back-office access for that reason.
 *
 * TikTok tokens rotate (access ~24h, refresh replaced on every use), which is
 * why they land in the `social_accounts` table rather than an env var the
 * running app could never rewrite.
 */
export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'tiktok_oauth_state';

export async function GET(_request: NextRequest) {
  await requireBackOfficeAccess();

  if (!socialConfig.tiktokClientKey) {
    return NextResponse.json({ error: 'TIKTOK_CLIENT_KEY is not configured' }, { status: 400 });
  }

  // CSRF: the value goes out in the URL and comes back in the callback, and is
  // compared against an httpOnly cookie only this browser holds.
  const state = crypto.randomBytes(16).toString('hex');

  const authorize = new URL('https://www.tiktok.com/v2/auth/authorize/');
  authorize.searchParams.set('client_key', socialConfig.tiktokClientKey);
  authorize.searchParams.set('scope', 'user.info.basic,video.publish,video.upload');
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('redirect_uri', `${baseUrl()}/api/social/tiktok/callback`);
  authorize.searchParams.set('state', state);

  const response = NextResponse.redirect(authorize.toString());
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60,
  });
  return response;
}
