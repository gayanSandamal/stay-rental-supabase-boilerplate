import { NextRequest, NextResponse } from 'next/server';
import { requireBackOfficeAccess } from '@/lib/auth/back-office';
import { logAudit } from '@/lib/db/audit-logger';
import {
  SOCIAL_HTTP_TIMEOUT_MS,
  TIKTOK_API_BASE,
  baseUrl,
  socialConfig,
} from '@/lib/social/config';
import { saveTikTokAccount } from '@/lib/social/adapters/tiktok';

/**
 * TikTok OAuth callback. Exchanges the authorization code for the token pair
 * and stores it, so the publish adapter has something to refresh from.
 *
 * Never logs or echoes the tokens — the redirect target carries a status only.
 */
export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'tiktok_oauth_state';

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

    await saveTikTokAccount({
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresIn: json.expires_in,
      refreshExpiresIn: json.refresh_expires_in,
      openId: json.open_id,
      scope: json.scope,
      connectedBy: user.id,
    });

    await logAudit({
      action: 'feature_flag_updated',
      entityType: 'social_account',
      userId: user.id,
      // Deliberately records only that a connection happened, never the tokens.
      metadata: { platform: 'tiktok', action: 'connected', scope: json.scope ?? null },
    }).catch(() => {});

    const response = back('connected');
    response.cookies.delete(STATE_COOKIE);
    return response;
  } catch (err) {
    console.error('[social] tiktok callback error', err);
    return back('error');
  }
}
