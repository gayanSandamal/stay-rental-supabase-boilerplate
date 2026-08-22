/**
 * TikTok adapter (Content Posting API, photo mode).
 *
 * Three things make this the most constrained of the four targets, and all
 * three are properties of TikTok's platform rather than of this code:
 *
 *  1. AUDIT. Until TikTok audits the app, every post is forced to SELF_ONLY
 *     (private) and at most 5 creators may post per 24h. That is why
 *     `socialPublishTikTok` defaults OFF — switching it on before the audit
 *     produces posts nobody can see.
 *  2. URL OWNERSHIP. PULL_FROM_URL only accepts images from a domain or URL
 *     prefix verified in the TikTok developer portal. Our proxy prefix
 *     (`/api/social/img/`) is what gets verified; Supabase URLs never work.
 *  3. NO DELETE. There is no takedown endpoint, so `supportsRemove` is false.
 *
 * Tokens rotate (access ~24h, refresh replaced on use), so they live in the
 * `social_accounts` table rather than the environment.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { socialAccounts } from '@/lib/db/schema';
import { SOCIAL_HTTP_TIMEOUT_MS, TIKTOK_API_BASE, isTikTokConfigured, socialConfig } from '../config';
import type { PublishResult, SocialAdapter, SocialPostInput } from '../types';

const POLL_ATTEMPTS = 10;
const POLL_INTERVAL_MS = 3_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Refresh when the token has under this long to live. */
const REFRESH_SKEW_MS = 5 * 60 * 1000;

interface TikTokTokens {
  accessToken: string;
  openId: string | null;
}

/**
 * The current access token, refreshed in place if it is close to expiry.
 * Returns null when TikTok has never been connected, which the caller reports
 * as a non-retriable configuration problem.
 */
async function currentToken(): Promise<TikTokTokens | null> {
  const row = await db.query.socialAccounts.findFirst({
    where: eq(socialAccounts.platform, 'tiktok'),
  });
  if (!row) return null;

  const stillValid = row.expiresAt && row.expiresAt.getTime() - Date.now() > REFRESH_SKEW_MS;
  if (stillValid) {
    return { accessToken: row.accessToken, openId: row.externalAccountId };
  }
  if (!row.refreshToken) return { accessToken: row.accessToken, openId: row.externalAccountId };

  try {
    const res = await fetch(`${TIKTOK_API_BASE}/oauth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: socialConfig.tiktokClientKey,
        client_secret: socialConfig.tiktokClientSecret,
        grant_type: 'refresh_token',
        refresh_token: row.refreshToken,
      }),
      signal: AbortSignal.timeout(SOCIAL_HTTP_TIMEOUT_MS),
    });
    const json = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      refresh_expires_in?: number;
      open_id?: string;
      error?: string;
    };
    if (!res.ok || !json.access_token) {
      console.error('[social] tiktok token refresh failed', json.error ?? res.status);
      // Fall back to the stored token; it may still have a little life left.
      return { accessToken: row.accessToken, openId: row.externalAccountId };
    }

    const now = Date.now();
    await db
      .update(socialAccounts)
      .set({
        accessToken: json.access_token,
        // The refresh token ROTATES — storing the old one would break the next
        // refresh, which is the classic way these integrations die quietly.
        refreshToken: json.refresh_token ?? row.refreshToken,
        expiresAt: json.expires_in ? new Date(now + json.expires_in * 1000) : null,
        refreshExpiresAt: json.refresh_expires_in
          ? new Date(now + json.refresh_expires_in * 1000)
          : row.refreshExpiresAt,
        updatedAt: new Date(),
      })
      .where(eq(socialAccounts.platform, 'tiktok'));

    return { accessToken: json.access_token, openId: json.open_id ?? row.externalAccountId };
  } catch (err) {
    console.error('[social] tiktok token refresh error', err);
    return { accessToken: row.accessToken, openId: row.externalAccountId };
  }
}

async function tiktokPost<T>(
  path: string,
  token: string,
  body: unknown
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  try {
    const res = await fetch(`${TIKTOK_API_BASE}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SOCIAL_HTTP_TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => null)) as
      | (T & { error?: { code?: string; message?: string } })
      | null;
    const code = json?.error?.code;
    if (!res.ok || (code && code !== 'ok')) {
      return {
        ok: false,
        error: json?.error?.message ?? `HTTP ${res.status}`,
        status: res.status,
      };
    }
    return { ok: true, data: json as T };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Network error',
      status: 0,
    };
  }
}

async function publish(input: SocialPostInput): Promise<PublishResult> {
  if (!isTikTokConfigured()) {
    console.log(
      `[social:dry-run] tiktok listing=${input.listingId} images=${input.imageUrls.length}\n${input.caption}`
    );
    return { ok: true, remotePostId: `dryrun-tiktok-${input.listingId}` };
  }

  const tokens = await currentToken();
  if (!tokens) {
    return {
      ok: false,
      error: 'TikTok account not connected — link it in Back Office → Social',
      retriable: false,
    };
  }
  if (!input.imageUrls.length) {
    return { ok: false, error: 'Listing has no photos to publish', retriable: false };
  }

  // TikTok's UX rules require querying creator info before composing a post —
  // it also tells us which privacy levels this account may actually use.
  const creator = await tiktokPost<{
    data?: { privacy_level_options?: string[] };
  }>('/post/publish/creator_info/query/', tokens.accessToken, {});
  if (!creator.ok) {
    // 401 means the token is dead and refresh did not save it.
    return {
      ok: false,
      error: creator.error,
      retriable: creator.status !== 401 && creator.status !== 403,
    };
  }

  const options = creator.data.data?.privacy_level_options ?? [];
  // An unaudited client only ever gets SELF_ONLY. Take the most public option
  // the account actually offers rather than assuming.
  const privacy = options.includes('PUBLIC_TO_EVERYONE')
    ? 'PUBLIC_TO_EVERYONE'
    : (options[0] ?? 'SELF_ONLY');

  const title = input.caption.split('\n')[0]?.slice(0, 90) ?? '';

  const init = await tiktokPost<{ data?: { publish_id?: string } }>(
    '/post/publish/content/init/',
    tokens.accessToken,
    {
      post_info: {
        title,
        description: input.caption,
        privacy_level: privacy,
        disable_comment: false,
        auto_add_music: true,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        photo_cover_index: 0,
        photo_images: input.imageUrls,
      },
      post_mode: 'DIRECT_POST',
      media_type: 'PHOTO',
    }
  );

  if (!init.ok) {
    const terminal =
      init.status === 401 ||
      init.status === 403 ||
      /url_ownership_unverified|privacy_level/i.test(init.error);
    return { ok: false, error: init.error, retriable: !terminal };
  }

  const publishId = init.data.data?.publish_id;
  if (!publishId) {
    return { ok: false, error: 'TikTok did not return a publish id', retriable: true };
  }

  // Poll to a terminal state so a failure surfaces here rather than as a post
  // that silently never appeared.
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    await sleep(POLL_INTERVAL_MS);
    const status = await tiktokPost<{
      data?: { status?: string; fail_reason?: string; publicaly_available_post_id?: string[] };
    }>('/post/publish/status/fetch/', tokens.accessToken, { publish_id: publishId });
    if (!status.ok) continue;

    const state = status.data.data?.status;
    if (state === 'PUBLISH_COMPLETE') {
      const postId = status.data.data?.publicaly_available_post_id?.[0];
      return {
        ok: true,
        remotePostId: postId ?? publishId,
        permalink: postId ? `https://www.tiktok.com/video/${postId}` : undefined,
        note:
          privacy === 'SELF_ONLY'
            ? 'Posted PRIVATELY — TikTok restricts unaudited apps to SELF_ONLY'
            : undefined,
      };
    }
    if (state === 'FAILED') {
      return {
        ok: false,
        error: status.data.data?.fail_reason ?? 'TikTok publish failed',
        retriable: false,
      };
    }
  }

  // Still processing. The post may yet appear, so record the handle we have and
  // let ops confirm rather than retrying and risking a duplicate.
  return {
    ok: true,
    remotePostId: publishId,
    note: 'Still processing at TikTok when we stopped polling — verify it appeared',
  };
}

async function remove(): Promise<boolean> {
  // No delete endpoint exists in the Content Posting API.
  return false;
}

export const tiktokAdapter: SocialAdapter = {
  platform: 'tiktok',
  isConfigured: isTikTokConfigured,
  supportsRemove: false,
  publish,
  remove,
};

/** Used by the OAuth callback to store a freshly connected account. */
export async function saveTikTokAccount(args: {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  refreshExpiresIn?: number;
  openId?: string;
  scope?: string;
  connectedBy?: number;
}): Promise<void> {
  const now = Date.now();
  const values = {
    platform: 'tiktok',
    externalAccountId: args.openId ?? null,
    accessToken: args.accessToken,
    refreshToken: args.refreshToken ?? null,
    expiresAt: args.expiresIn ? new Date(now + args.expiresIn * 1000) : null,
    refreshExpiresAt: args.refreshExpiresIn ? new Date(now + args.refreshExpiresIn * 1000) : null,
    scope: args.scope ?? null,
    connectedBy: args.connectedBy ?? null,
    updatedAt: new Date(),
  };
  await db
    .insert(socialAccounts)
    .values(values)
    .onConflictDoUpdate({ target: socialAccounts.platform, set: values });
}

/** Whether a TikTok account has actually been linked (vs. just having app keys). */
export async function isTikTokConnected(): Promise<boolean> {
  const row = await db.query.socialAccounts.findFirst({
    where: and(eq(socialAccounts.platform, 'tiktok')),
    columns: { id: true },
  });
  return Boolean(row);
}
