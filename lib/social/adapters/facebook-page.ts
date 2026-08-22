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

  return {
    ok: true,
    remotePostId: post.data.id,
    permalink: `https://www.facebook.com/${post.data.id}`,
  };
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
