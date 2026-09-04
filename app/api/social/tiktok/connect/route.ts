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

export const STATE_COOKIE = 'tiktok_oauth_state';
export const VERIFIER_COOKIE = 'tiktok_oauth_verifier';

/**
 * PKCE, which TikTok REQUIRES — omitting it fails the authorize call outright
 * with `error_type=code_challenge&errCode=10007`, before the user ever sees a
 * consent screen. (Observed 2026-09-04 against the live endpoint.)
 *
 * ⚠️ TikTok deviates from RFC 7636 here: the challenge is the SHA-256 of the
 * verifier **hex-encoded**, not base64url as every other provider uses. Sending
 * base64url is rejected the same way as sending nothing. Do not "fix" this to
 * match the RFC.
 */
function pkce(): { verifier: string; challenge: string } {
  // 64 hex chars — inside RFC 7636's 43-128 range and all-unreserved.
  const verifier = crypto.randomBytes(32).toString('hex');
  const challenge = crypto.createHash('sha256').update(verifier).digest('hex');
  return { verifier, challenge };
}

export async function GET(_request: NextRequest) {
  await requireBackOfficeAccess();

  if (!socialConfig.tiktokClientKey) {
    return NextResponse.json({ error: 'TIKTOK_CLIENT_KEY is not configured' }, { status: 400 });
  }

  // CSRF: the value goes out in the URL and comes back in the callback, and is
  // compared against an httpOnly cookie only this browser holds.
  const state = crypto.randomBytes(16).toString('hex');
  const { verifier, challenge } = pkce();

  const authorize = new URL('https://www.tiktok.com/v2/auth/authorize/');
  authorize.searchParams.set('client_key', socialConfig.tiktokClientKey);
  /*
   * Exactly the scopes this app exercises, and no more.
   *
   * `video.upload` is deliberately absent. It grants the inbox/draft flow, where
   * the user finishes posting inside TikTok — and `publish()` only ever sends
   * `post_mode: 'DIRECT_POST'`, which is what `video.publish` covers (photo
   * posts included; TikTok names the whole Content Posting API `video.*`).
   *
   * Requesting it anyway is not free: app review requires every requested scope
   * to be demonstrated in the submitted demo video, and one that the code never
   * calls cannot be. TikTok's own guidance is that unneeded scopes delay review.
   */
  authorize.searchParams.set('scope', 'user.info.basic,video.publish');
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('redirect_uri', `${baseUrl()}/api/social/tiktok/callback`);
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('code_challenge', challenge);
  authorize.searchParams.set('code_challenge_method', 'S256');

  const cookie = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 10 * 60,
  };

  const response = NextResponse.redirect(authorize.toString());
  response.cookies.set(STATE_COOKIE, state, cookie);
  // The verifier NEVER goes in the URL — that is the entire point of PKCE. It
  // stays in this browser and is presented only at the token exchange.
  response.cookies.set(VERIFIER_COOKIE, verifier, cookie);
  return response;
}
