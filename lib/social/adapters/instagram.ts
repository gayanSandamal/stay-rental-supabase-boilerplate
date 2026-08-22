/**
 * Instagram adapter (Content Publishing API).
 *
 * Publishing is a two-phase dance: build a media CONTAINER per image, then
 * publish it. For more than one image the containers become `children` of a
 * CAROUSEL container, which is what gets published.
 *
 * Two traps this implementation handles explicitly:
 *  1. A container is not immediately usable. Publishing one that is still
 *     IN_PROGRESS fails, and that is the single most common cause of flaky IG
 *     publishes — so every container is polled to FINISHED first.
 *  2. There is NO delete endpoint. `supportsRemove` is false and a takedown is
 *     a manual job; the ops UI has to say so rather than pretend it worked.
 */

import { isInstagramConfigured, socialConfig } from '../config';
import type { PublishResult, SocialAdapter, SocialPostInput } from '../types';
import { graphGet, graphPost, isPermissionError, isRateLimitError, isTokenError } from './graph';

/** Instagram's carousel ceiling. */
const MAX_CAROUSEL = 10;
/** Container readiness polling. Meta ingests the image during this window. */
const POLL_ATTEMPTS = 10;
const POLL_INTERVAL_MS = 2_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wait for a container to finish ingesting. Returns null when it is ready, or
 * an error string when it failed or never settled.
 */
async function awaitContainer(containerId: string): Promise<string | null> {
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const res = await graphGet<{ status_code?: string; status?: string }>(containerId, {
      fields: 'status_code,status',
    });
    if (!res.ok) return res.error.message;

    const status = res.data.status_code;
    if (status === 'FINISHED') return null;
    if (status === 'ERROR' || status === 'EXPIRED') {
      return res.data.status ?? `Container ${status}`;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return 'Container did not finish in time';
}

/**
 * Are we inside the 24h publishing quota? Checked BEFORE building containers so
 * a full window costs nothing. Returns true when publishing may proceed —
 * failing open, since a missing quota reading should not block the queue.
 */
async function hasQuota(igId: string): Promise<boolean> {
  const res = await graphGet<{ data?: Array<{ quota_usage?: number; config?: { quota_total?: number } }> }>(
    `${igId}/content_publishing_limit`,
    { fields: 'config,quota_usage' }
  );
  if (!res.ok) return true;
  const row = res.data.data?.[0];
  const used = row?.quota_usage ?? 0;
  const total = row?.config?.quota_total ?? 100;
  return used < total;
}

async function publish(input: SocialPostInput): Promise<PublishResult> {
  if (!isInstagramConfigured()) {
    console.log(
      `[social:dry-run] instagram listing=${input.listingId} images=${input.imageUrls.length}\n${input.caption}`
    );
    return { ok: true, remotePostId: `dryrun-instagram-${input.listingId}` };
  }

  const igId = socialConfig.instagramAccountId;
  const images = input.imageUrls.slice(0, MAX_CAROUSEL);
  if (!images.length) {
    return { ok: false, error: 'Listing has no photos to publish', retriable: false };
  }

  if (!(await hasQuota(igId))) {
    return {
      ok: false,
      error: 'Instagram 24h publishing quota reached',
      retriable: true,
      rateLimited: true,
    };
  }

  const single = images.length === 1;

  // --- containers ---------------------------------------------------------
  const childIds: string[] = [];
  for (const url of images) {
    const res = await graphPost<{ id: string }>(`${igId}/media`, {
      image_url: url,
      ...(single ? { caption: input.caption } : { is_carousel_item: 'true' }),
    });
    if (!res.ok) {
      const terminal = isTokenError(res.error) || isPermissionError(res.error);
      return {
        ok: false,
        error: res.error.message,
        retriable: !terminal,
        rateLimited: isRateLimitError(res.error),
      };
    }
    const failure = await awaitContainer(res.data.id);
    if (failure) {
      // An image Meta could not ingest will not ingest on a retry either.
      return { ok: false, error: failure, retriable: false };
    }
    childIds.push(res.data.id);
  }

  // --- the thing we actually publish --------------------------------------
  let publishTarget = childIds[0];

  if (!single) {
    const carousel = await graphPost<{ id: string }>(`${igId}/media`, {
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      caption: input.caption,
    });
    if (!carousel.ok) {
      const terminal = isTokenError(carousel.error) || isPermissionError(carousel.error);
      return {
        ok: false,
        error: carousel.error.message,
        retriable: !terminal,
        rateLimited: isRateLimitError(carousel.error),
      };
    }
    const failure = await awaitContainer(carousel.data.id);
    if (failure) return { ok: false, error: failure, retriable: false };
    publishTarget = carousel.data.id;
  }

  const published = await graphPost<{ id: string }>(`${igId}/media_publish`, {
    creation_id: publishTarget,
  });
  if (!published.ok) {
    const terminal = isTokenError(published.error) || isPermissionError(published.error);
    return {
      ok: false,
      error: published.error.message,
      retriable: !terminal,
      rateLimited: isRateLimitError(published.error),
    };
  }

  // Best-effort permalink — ops need it because takedown is manual.
  const permalink = await graphGet<{ permalink?: string }>(published.data.id, {
    fields: 'permalink',
  });

  return {
    ok: true,
    remotePostId: published.data.id,
    permalink: permalink.ok ? permalink.data.permalink : undefined,
  };
}

async function remove(): Promise<boolean> {
  // Instagram exposes no delete endpoint. Returning false is the honest answer
  // and makes the ops UI show "remove this by hand" instead of claiming success.
  return false;
}

export const instagramAdapter: SocialAdapter = {
  platform: 'instagram',
  isConfigured: isInstagramConfigured,
  supportsRemove: false,
  publish,
  remove,
};
