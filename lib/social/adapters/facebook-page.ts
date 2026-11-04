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
import type { MetricsResult, PublishResult, SocialAdapter, SocialPostInput } from '../types';
import {
  graphDelete,
  graphGet,
  graphInsightValue,
  graphPost,
  isPermissionError,
  isRateLimitError,
  isTokenError,
} from './graph';
import { facebookPostUrl, resolveFacebookPublicPageRef } from '../facebook-permalink';

/** Kept here for the callers and tests that already import it from the adapter. */
export { normalizeFacebookPermalink } from '../facebook-permalink';

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

  // Graph's permalink_url carries the story id we trust and, since ~Oct 2026,
  // a lead id the Facebook app cannot open — facebookPostUrl swaps it for the
  // Page's public id. See lib/social/facebook-permalink.ts for the measurements.
  const permalink = await graphGet<{ permalink_url?: string }>(post.data.id, {
    fields: 'permalink_url',
  });
  const publicPageRef = await resolveFacebookPublicPageRef({ network: true });
  const url = facebookPostUrl({
    permalink: permalink.ok ? permalink.data.permalink_url : null,
    remotePostId: post.data.id,
    publicPageRef,
  });
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

/**
 * Views for a Page post.
 *
 * `post_media_view` is the CURRENT metric. Meta retired the whole
 * `post_impressions` family — `post_impressions_unique` on 2025-06-15 and
 * `post_impressions` itself on 2025-11-15 — and the API's answer for a retired
 * metric is a flat `(#100) The value must be a valid insights metric`, not a
 * deprecation warning. Verified against our own live Page on 2026-09-11: both
 * old names returned #100 for listing 34's post, so every Facebook figure read
 * as unknown. Meta's mapping:
 *
 *   post_impressions        → post_media_view
 *   post_impressions_unique → post_total_media_view_unique
 *
 * `views` is the second candidate: Meta's own Page Insights announcement names
 * it as what `impressions` became, and the two naming families landed on
 * different surfaces, so which one answers for a Page post is not knowable from
 * the docs alone. The chain asks and keeps the first real answer.
 *
 * The unique variant stays LAST because it counts PEOPLE, not views, and is
 * therefore always the smaller number — a degraded reading should under-count
 * rather than over-count. Retired names are not kept as further fallbacks: they
 * cannot succeed on any current version, so they would only add a
 * guaranteed-failed HTTP call to every refresh.
 *
 * All of this is asked on GRAPH_INSIGHTS_API_BASE, not the older shared
 * GRAPH_API_BASE — a metric the requested version has never heard of returns
 * the same #100 as a retired one. See the note in graph.ts.
 */
async function metrics(remotePostId: string): Promise<MetricsResult> {
  if (!isFacebookPageConfigured()) {
    return { ok: false, error: 'Facebook Page not configured', permanent: true };
  }
  const res = await graphInsightValue(remotePostId, [
    'post_media_view',
    'views',
    'post_total_media_view_unique',
  ]);
  if ('value' in res) return { ok: true, views: res.value };
  return { ok: false, error: res.error.message, permanent: res.permanent };
}

export const facebookPageAdapter: SocialAdapter = {
  platform: 'facebook_page',
  isConfigured: isFacebookPageConfigured,
  supportsRemove: true,
  publish,
  remove,
  metrics,
};
