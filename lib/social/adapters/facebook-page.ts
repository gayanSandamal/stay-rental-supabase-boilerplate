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

  // Only Facebook can tell us a post's public URL — see normalizeFacebookPermalink.
  const permalink = await graphGet<{ permalink_url?: string }>(post.data.id, {
    fields: 'permalink_url',
  });
  const url = permalink.ok ? normalizeFacebookPermalink(permalink.data.permalink_url) : null;
  if (!url) {
    // Surfaced rather than papered over: the row still says `posted` and holds
    // the remote id, so ops can find the post — they just have no link to
    // click, which is the honest state.
    console.error(
      '[social] facebook permalink unavailable for',
      post.data.id,
      permalink.ok ? '(no permalink_url in response)' : permalink.error.message
    );
  }

  return { ok: true, remotePostId: post.data.id, permalink: url ?? undefined };
}

/**
 * Make Graph's `permalink_url` absolute. Returns null when there is nothing
 * usable — never a guess.
 *
 * WHY THERE IS NO CONSTRUCTED FALLBACK. A Page has TWO different ids, and the
 * one we publish with is not the one its public URLs use:
 *
 *   FACEBOOK_PAGE_ID          1229347226919525   ← what Graph publishes with
 *   the Page's public actor    61591091318155    ← what facebook.com URLs use
 *
 * Graph returns a post id as `{FACEBOOK_PAGE_ID}_{story-id}`, so ANY URL built
 * out of that carries the wrong id. Measured against listing #26's live post:
 *
 *   /1229347226919525_122111941959369710       → "Log into Facebook"
 *   /permalink.php?story_fbid=…&id=…           → "Log into Facebook"
 *   /1229347226919525/posts/122111941959369710 → renders on web, but only via a
 *                                                redirect; the mobile app can't
 *                                                deep-link it → "This isn't
 *                                                available"
 *   /61591091318155/posts/…/122111941959369710/ → the post, everywhere
 *
 * That last one is what Facebook itself advertises as `rel="canonical"`, and
 * `permalink_url` is where Graph hands it to us. The actor id appears nowhere
 * in our configuration, so there is nothing correct to build a URL from
 * locally — hence null, and a logged error, rather than a link that renders in
 * a logged-in desktop tab and dies in every landlord's phone.
 */
export function normalizeFacebookPermalink(raw: string | null | undefined): string | null {
  const url = (raw ?? '').trim();
  if (!url) return null;
  if (url.startsWith('/')) return `https://www.facebook.com${url}`;
  return /^https?:\/\//i.test(url) ? url : null;
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
