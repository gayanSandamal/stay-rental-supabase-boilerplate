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

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { socialAccounts } from '@/lib/db/schema';
import {
  SOCIAL_HTTP_TIMEOUT_MS,
  TIKTOK_API_BASE,
  TIKTOK_POLL_ATTEMPTS,
  TIKTOK_POLL_INTERVAL_MS,
  isTikTokConfigured,
  socialConfig,
} from '../config';
import { DRY_RUN_ID_PREFIX } from '../types';
import type { PublishResult, SocialAdapter, SocialPostInput } from '../types';

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
    return { ok: true, remotePostId: `${DRY_RUN_ID_PREFIX}tiktok-${input.listingId}` };
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

  let privacy: string;
  if (input.privacyLevel) {
    // A human chose. If the account cannot actually offer it, FAIL rather than
    // substitute: posting more publicly than was chosen is a privacy breach,
    // and posting more privately is a lie to the operator who picked.
    if (!options.includes(input.privacyLevel)) {
      return {
        ok: false,
        error: `TikTok will not accept privacy level ${input.privacyLevel} for this account (allowed: ${options.join(', ') || 'none'})`,
        retriable: false,
      };
    }
    privacy = input.privacyLevel;
  } else {
    // No human in the loop (the cron path). An unaudited client only ever gets
    // SELF_ONLY; take the most public option the account actually offers rather
    // than assuming one.
    privacy = options.includes('PUBLIC_TO_EVERYONE')
      ? 'PUBLIC_TO_EVERYONE'
      : (options[0] ?? 'SELF_ONLY');
  }

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
  for (let i = 0; i < TIKTOK_POLL_ATTEMPTS; i++) {
    await sleep(TIKTOK_POLL_INTERVAL_MS);
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

/**
 * The account's own name, for the ops health panel.
 *
 * Best-effort by design. `user.info.basic` is in the requested scope, but a
 * connection that can publish must never be rejected because a cosmetic lookup
 * failed — the name is how ops confirms we are pointed at the right account,
 * not something publishing depends on.
 */
export interface TikTokProfile {
  displayName: string | null;
  /** Signed and short-lived — a cache, never something to depend on. */
  avatarUrl: string | null;
}

export async function fetchTikTokProfile(accessToken: string): Promise<TikTokProfile> {
  try {
    const res = await fetch(`${TIKTOK_API_BASE}/user/info/?fields=display_name,avatar_url`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(SOCIAL_HTTP_TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => null)) as {
      data?: { user?: { display_name?: string; avatar_url?: string } };
    } | null;
    return {
      displayName: json?.data?.user?.display_name || null,
      avatarUrl: json?.data?.user?.avatar_url || null,
    };
  } catch (err) {
    console.error('[social] tiktok profile lookup failed', err);
    return { displayName: null, avatarUrl: null };
  }
}

/** Used by the OAuth callback to store a freshly connected account. */
export async function saveTikTokAccount(args: {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  refreshExpiresIn?: number;
  openId?: string;
  displayName?: string | null;
  avatarUrl?: string | null;
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
    // Only written when we actually got one. Spreading a null here would let a
    // failed cosmetic lookup during a RE-connect erase what we already had.
    ...(args.displayName ? { displayName: args.displayName } : {}),
    ...(args.avatarUrl ? { avatarUrl: args.avatarUrl } : {}),
  };
  await db
    .insert(socialAccounts)
    .values(values)
    .onConflictDoUpdate({ target: socialAccounts.platform, set: values });
}

/**
 * The non-secret facts about the linked account, for the ops health panel.
 *
 * Deliberately returns NO token material: `health.ts` renders straight into a
 * page and onto the publish cron's JSON, and neither may ever carry a token.
 */
export interface TikTokConnection {
  displayName: string | null;
  /** Cached and expiring — render with an initials fallback, never bare. */
  avatarUrl: string | null;
  externalAccountId: string | null;
  /**
   * Access token expiry (~24h). Not an ops concern: `currentToken()` refreshes
   * it in place on every publish.
   */
  expiresAt: Date | null;
  /**
   * Refresh token expiry (~365d). THIS is the one a human has to act on — once
   * it lapses there is nothing left to refresh from, and only re-authorising
   * restores publishing.
   */
  refreshExpiresAt: Date | null;
  connectedAt: Date;
}

/**
 * Who we would be posting as, and what this account is allowed to choose.
 *
 * TikTok requires `creator_info/query` before composing a Direct Post, and its
 * UX rules require showing the creator WHO the post goes out as and letting
 * them pick the privacy level — the app may not assume one. This is what feeds
 * the review screen, so every option offered there is one TikTok has just said
 * this account can actually use.
 *
 * `privacyLevelOptions` narrows to `['SELF_ONLY']` while the app is unaudited.
 * That is not a bug to work around: it is TikTok telling us the truth about
 * what an unaudited client may do, and the screen must show it plainly.
 */
export interface TikTokCreatorInfo {
  nickname: string | null;
  username: string | null;
  avatarUrl: string | null;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
}

export type CreatorInfoResult =
  | { ok: true; info: TikTokCreatorInfo }
  | { ok: false; error: string };

export async function getTikTokCreatorInfo(): Promise<CreatorInfoResult> {
  if (!isTikTokConfigured()) {
    return { ok: false, error: 'TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET are not configured' };
  }
  const tokens = await currentToken();
  if (!tokens) {
    return { ok: false, error: 'No TikTok account is linked — connect one in Back Office → Social' };
  }

  const res = await tiktokPost<{
    data?: {
      creator_nickname?: string;
      creator_username?: string;
      creator_avatar_url?: string;
      privacy_level_options?: string[];
      comment_disabled?: boolean;
    };
  }>('/post/publish/creator_info/query/', tokens.accessToken, {});

  if (!res.ok) return { ok: false, error: res.error };

  const data = res.data.data ?? {};
  const info: TikTokCreatorInfo = {
    nickname: data.creator_nickname ?? null,
    username: data.creator_username ?? null,
    avatarUrl: data.creator_avatar_url ?? null,
    privacyLevelOptions: data.privacy_level_options ?? [],
    commentDisabled: Boolean(data.comment_disabled),
  };

  // Opportunistic refresh. TikTok's avatar URLs expire, and this call already
  // returns a fresh one — so the stored copy stays usable without a dedicated
  // request on every page render. Never allowed to fail the query.
  if (info.avatarUrl || info.nickname) {
    await db
      .update(socialAccounts)
      .set({
        ...(info.avatarUrl ? { avatarUrl: info.avatarUrl } : {}),
        ...(info.nickname ? { displayName: info.nickname } : {}),
        updatedAt: new Date(),
      })
      .where(eq(socialAccounts.platform, 'tiktok'))
      .catch((err) => {
        console.error('[social] tiktok creator info cache refresh failed', err);
      });
  }

  return { ok: true, info };
}

/** The linked TikTok account, or null when nobody has connected one yet. */
export async function getTikTokConnection(): Promise<TikTokConnection | null> {
  const row = await db.query.socialAccounts.findFirst({
    where: eq(socialAccounts.platform, 'tiktok'),
    columns: {
      displayName: true,
      avatarUrl: true,
      externalAccountId: true,
      expiresAt: true,
      refreshExpiresAt: true,
      createdAt: true,
    },
  });
  if (!row) return null;
  return {
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    externalAccountId: row.externalAccountId,
    expiresAt: row.expiresAt,
    refreshExpiresAt: row.refreshExpiresAt,
    connectedAt: row.createdAt,
  };
}
