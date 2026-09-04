import { NextRequest, NextResponse } from 'next/server';
import { requireBackOfficeAccess } from '@/lib/auth/back-office';
import { logAudit } from '@/lib/db/audit-logger';
import {
  SOCIAL_HTTP_TIMEOUT_MS,
  TIKTOK_API_BASE,
  baseUrl,
  socialConfig,
} from '@/lib/social/config';
import { fetchTikTokProfile, saveTikTokAccount } from '@/lib/social/adapters/tiktok';
import { resetCredentialHealthCache } from '@/lib/social/health';

/**
 * TikTok OAuth callback. Exchanges the authorization code for the token pair
 * and stores it, so the publish adapter has something to refresh from.
 *
 * Never logs or echoes the tokens — the redirect target carries a status only.
 */
export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'tiktok_oauth_state';
const VERIFIER_COOKIE = 'tiktok_oauth_verifier';

function back(status: string) {
  return NextResponse.redirect(`${baseUrl()}/back-office/social?tiktok=${status}`);
}

export async function GET(request: NextRequest) {
  const user = await requireBackOfficeAccess();

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;

  if (url.searchParams.get('error')) return back('denied');
  if (!code) return back('missing_code');
  // Fail closed on CSRF: a missing cookie is as bad as a mismatched one.
  if (!state || !expectedState || state !== expectedState) return back('bad_state');

  // The PKCE verifier the /connect leg stashed. Without it TikTok rejects the
  // exchange, so treat its absence as the same class of failure as a bad state
  // — both mean this callback does not belong to a flow we started.
  const verifier = request.cookies.get(VERIFIER_COOKIE)?.value;
  if (!verifier) return back('bad_state');

  try {
    const res = await fetch(`${TIKTOK_API_BASE}/oauth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: socialConfig.tiktokClientKey,
        client_secret: socialConfig.tiktokClientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${baseUrl()}/api/social/tiktok/callback`,
        code_verifier: verifier,
      }),
      signal: AbortSignal.timeout(SOCIAL_HTTP_TIMEOUT_MS),
    });

    const json = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      refresh_expires_in?: number;
      open_id?: string;
      scope?: string;
      error?: string;
    };

    if (!res.ok || !json.access_token) {
      // The error CODE is safe to log; the body may carry token material.
      console.error('[social] tiktok token exchange failed', json.error ?? res.status);
      return back('exchange_failed');
    }

    // Best-effort, and the visible payoff of the `user.info.basic` scope: Back
    // Office → Social shows the name and avatar so ops can see WHICH account
    // got linked. A null here never blocks the connection.
    const profile = await fetchTikTokProfile(json.access_token);

    await saveTikTokAccount({
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresIn: json.expires_in,
      refreshExpiresIn: json.refresh_expires_in,
      openId: json.open_id,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      scope: json.scope,
      connectedBy: user.id,
    });

    // The panel we are about to redirect to reads a 60s-cached snapshot taken
    // before this account existed. Without this it would greet the operator
    // with "no account linked" directly beneath "TikTok connected".
    resetCredentialHealthCache();

    await logAudit({
      action: 'social_account_connected',
      entityType: 'social_account',
      userId: user.id,
      // Deliberately records only that a connection happened, never the tokens.
      metadata: {
        platform: 'tiktok',
        scope: json.scope ?? null,
        displayName: profile.displayName,
      },
    }).catch(() => {});

    const response = back('connected');
    // Both are single-use by intent: a replayed callback must not be able to
    // re-run an exchange with the same verifier.
    response.cookies.delete(STATE_COOKIE);
    response.cookies.delete(VERIFIER_COOKIE);
    return response;
  } catch (err) {
    console.error('[social] tiktok callback error', err);
    return back('error');
  }
}
