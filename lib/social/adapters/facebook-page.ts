/**
 * Facebook Page adapter.
 *
 * The only one of the four networks that can both publish AND delete through
 * the API, which is why an ops "pull down" on a Page post actually removes it
 * while Instagram and TikTok can only be flagged for manual removal.
 *
 * Multi-photo posts are two steps: upload each photo UNPUBLISHED to /photos to
 * get a media_fbid, then create one /feed post attaching them all. Posting each
 * photo published would produce N separate posts instead of one album.
 */

import { isFacebookPageConfigured, socialConfig } from '../config';
import { DRY_RUN_ID_PREFIX } from '../types';
import type { PublishResult, SocialAdapter, SocialPostInput } from '../types';
import {
  graphDelete,
  graphGet,
  graphPost,
  isPermissionError,
  isRateLimitError,
  isTokenError,
} from './graph';

async function publish(input: SocialPostInput): Promise<PublishResult> {
  if (!isFacebookPageConfigured()) {
    console.log(
      `[social:dry-run] facebook_page listing=${input.listingId} images=${input.imageUrls.length}\n${input.caption}`
    );
    return { ok: true, remotePostId: `${DRY_RUN_ID_PREFIX}facebook_page-${input.listingId}` };
  }

  const pageId = socialConfig.facebookPageId;

  // Step 1 — stage each photo unpublished.
  const mediaIds: string[] = [];
  for (const url of input.imageUrls) {
    const res = await graphPost<{ id: string }>(`${pageId}/photos`, {
      url,
      published: 'false',
    });
    if (!res.ok) {
      // A single bad image should not sink the post if others worked; but with
      // none staged there is nothing to publish.
      console.error('[social] facebook photo stage failed', res.error.message);
      if (isTokenError(res.error) || isPermissionError(res.error)) {
        return { ok: false, error: res.error.message, retriable: false };
      }
      if (isRateLimitError(res.error)) {
        return { ok: false, error: res.error.message, retriable: true, rateLimited: true };
      }
      continue;
    }
    mediaIds.push(res.data.id);
  }

  if (!mediaIds.length) {
    return {
      ok: false,
      error: 'No photos could be staged on Facebook',
      retriable: true,
    };
  }

  // Step 2 — one feed post attaching them all.
  const attached: Record<string, string> = {};
  mediaIds.forEach((id, i) => {
    attached[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id });
  });

  const post = await graphPost<{ id: string }>(`${pageId}/feed`, {
    message: input.caption,
    ...attached,
  });

  if (!post.ok) {
    const terminal = isTokenError(post.error) || isPermissionError(post.error);
    return {
      ok: false,
      error: post.error.message,
      retriable: !terminal,
      rateLimited: isRateLimitError(post.error),
    };
  }

  // Ask Facebook for its own URL rather than assembling one — same best-effort
  // shape the Instagram adapter already uses. A failure here must never fail a
  // post that has already gone out, so the constructed form is the fallback.
  const permalink = await graphGet<{ permalink_url?: string }>(post.data.id, {
    fields: 'permalink_url',
  });

  return {
    ok: true,
    remotePostId: post.data.id,
    permalink:
      (permalink.ok ? permalink.data.permalink_url : undefined) ??
      facebookPostUrl(post.data.id) ??
      undefined,
  };
}

/**
 * The PUBLIC, shareable URL for a Page post.
 *
 * `/{page-id}/posts/{story-id}`, NOT `/{composite-id}`. The Graph API returns
 * the post id as `{page-id}_{story-id}`, and dropping that straight after the
 * domain looks like it works — on desktop web, while logged in, Facebook
 * redirects it. It is not a real post URL:
 *
 *   facebook.com/1229347226919525_1221119…  → "Log into Facebook"
 *   facebook.com/1229347226919525/posts/…  → the post
 *
 * So the link Easy Rent sent landlords opened a LOGIN WALL for anyone not
 * already signed in, and the Facebook mobile app — which cannot deep-link the
 * composite form at all — showed "This isn't available". The message tells the
 * landlord to share the post with anyone who might be interested; a link that
 * demands a login is not shareable, which defeats the whole feature.
 */
export function facebookPostUrl(compositeId: string): string | null {
  const [pageId, storyId] = compositeId.split('_');
  if (!pageId || !storyId) return null;
  return `https://www.facebook.com/${pageId}/posts/${storyId}`;
}

async function remove(remotePostId: string): Promise<boolean> {
  if (!isFacebookPageConfigured()) {
    console.log(`[social:dry-run] facebook_page delete ${remotePostId}`);
    return true;
  }
  const res = await graphDelete<{ success?: boolean }>(remotePostId);
  if (!res.ok) {
    console.error('[social] facebook delete failed', remotePostId, res.error.message);
    return false;
  }
  return true;
}

export const facebookPageAdapter: SocialAdapter = {
  platform: 'facebook_page',
  isConfigured: isFacebookPageConfigured,
  supportsRemove: true,
  publish,
  remove,
};
