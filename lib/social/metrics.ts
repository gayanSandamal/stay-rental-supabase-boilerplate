/**
 * How many people the platforms say saw a listing's social posts.
 *
 * A public page cannot call Meta and TikTok while it renders — the round trips
 * alone would dominate the response, and the platforms' rate limits are per
 * app, not per visitor, so a single popular listing would exhaust them for
 * every other listing. So the numbers are read on the publish cron and stored
 * on `listing_social_posts`; the page only ever reads our own database.
 *
 * THE ONE RULE THIS MODULE EXISTS TO ENFORCE: unknown is not zero. A dry run,
 * a post whose insights have not been computed yet, a TikTok account connected
 * before `video.list` was requested, an expired Page token — every one of those
 * leaves `viewCount` NULL, and every reader renders NULL as "—". Printing 0
 * would tell a landlord their advert was seen by nobody on the strength of our
 * own missing permission, which is the same class of lie as reporting a
 * dry-run row as `posted`.
 */

import { and, asc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { listingSocialPosts } from '@/lib/db/schema';
import { adapterFor } from './registry';
import { DRY_RUN_ID_PREFIX, MEASURABLE_PLATFORMS, type SocialPlatform } from './types';

/**
 * How long a reading stays good. Social view counts move over days, not
 * minutes, and the cron ticks every five — re-reading each post twelve times
 * an hour would spend the whole Graph rate limit to redraw the same number.
 */
export const METRICS_STALE_MINUTES = Number(process.env.SOCIAL_METRICS_STALE_MINUTES ?? 180);
/** Posts read per cron tick. Sequential, so this is also the query count. */
export const METRICS_BATCH_SIZE = Number(process.env.SOCIAL_METRICS_BATCH_SIZE ?? 12);

export interface MetricsSweepCounts {
  /** Rows whose number we successfully refreshed. */
  read: number;
  /** Rows the platform would not answer for — left NULL or last-known. */
  unknown: number;
}

/**
 * Refresh the stalest batch of live posts.
 *
 * Strictly sequential, like every other job in this codebase: the pool is
 * `max: 1` against Supabase's transaction pooler and a `Promise.all` over a
 * batch wedges the request (CLAUDE.md; commit a3ac4f9). Each iteration is one
 * HTTP call plus one UPDATE, and the batch size is the bound on both.
 */
export async function refreshSocialMetrics(): Promise<MetricsSweepCounts> {
  const staleBefore = new Date(Date.now() - METRICS_STALE_MINUTES * 60 * 1000);

  const rows = await db
    .select({
      id: listingSocialPosts.id,
      listingId: listingSocialPosts.listingId,
      platform: listingSocialPosts.platform,
      remotePostId: listingSocialPosts.remotePostId,
    })
    .from(listingSocialPosts)
    .where(
      and(
        // Only a live post has anything to read. A `pulled` row is no longer on
        // the account, so its number is not a current fact about the listing.
        eq(listingSocialPosts.status, 'posted'),
        inArray(listingSocialPosts.platform, MEASURABLE_PLATFORMS),
        sql`${listingSocialPosts.remotePostId} is not null`,
        // Never ask about a post that was never sent.
        sql`${listingSocialPosts.remotePostId} not like ${DRY_RUN_ID_PREFIX + '%'}`,
        or(
          isNull(listingSocialPosts.metricsFetchedAt),
          lt(listingSocialPosts.metricsFetchedAt, staleBefore)
        )
      )
    )
    // Never-read rows first, then the stalest.
    .orderBy(asc(listingSocialPosts.metricsFetchedAt))
    .limit(METRICS_BATCH_SIZE);

  const counts: MetricsSweepCounts = { read: 0, unknown: 0 };

  for (const row of rows) {
    const adapter = adapterFor(row.platform as SocialPlatform);
    if (!adapter?.metrics || !row.remotePostId) continue;

    const result = await adapter.metrics(row.remotePostId);
    const now = new Date();

    if (result.ok) {
      await db
        .update(listingSocialPosts)
        .set({
          viewCount: result.views,
          metricsFetchedAt: now,
          metricsError: null,
          updatedAt: now,
        })
        .where(eq(listingSocialPosts.id, row.id));
      counts.read++;
      continue;
    }

    /*
     * A failure stamps `metricsFetchedAt` but leaves `viewCount` alone.
     *
     * Stamping is what turns "retry every five minutes forever" into "retry in
     * three hours" for the failures that need a human (a missing scope, a dead
     * token) — and because it is a timestamp rather than a dead flag, the row
     * heals by itself once the account is reconnected. Leaving `viewCount`
     * alone keeps the last good reading on screen instead of blanking a real
     * number because one call timed out.
     */
    await db
      .update(listingSocialPosts)
      .set({ metricsFetchedAt: now, metricsError: result.error, updatedAt: now })
      .where(eq(listingSocialPosts.id, row.id));
    counts.unknown++;
    console.warn(
      `[social:metrics] ${row.platform} listing=${row.listingId} unreadable: ${result.error}`
    );
  }

  return counts;
}
