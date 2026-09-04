/**
 * The social publish queue: enqueue on consent, then a cron-driven sweeper
 * claims rows, posts them and records the outcome.
 *
 * Claim/lease/retry deliberately copies `lib/moderation/engine.ts` — the same
 * `FOR UPDATE SKIP LOCKED` + expiring lease means overlapping cron runs never
 * double-post and a killed run self-heals with no separate reaper.
 */

import { and, eq, inArray, isNull, isNotNull, gt, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { listings, listingSocialPosts } from '@/lib/db/schema';
import { logAudit } from '@/lib/db/audit-logger';
import { createNotificationsForOpsAndAdmin } from '@/lib/notifications';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { buildCaption, type CaptionListing } from './caption';
import {
  SOCIAL_BATCH_SIZE,
  SOCIAL_LEASE_MINUTES,
  SOCIAL_MAX_ATTEMPTS,
  SOCIAL_RUN_BUDGET_MS,
  baseUrl,
} from './config';
import { socialImageUrls } from './images';
import { adapterFor, enabledPlatforms, isPlatformEnabled } from './registry';
import { MANUAL_ONLY_PREFIX } from './adapters/facebook-group';
import { isDryRunPost, type SocialPlatform } from './types';

type SocialPostRow = typeof listingSocialPosts.$inferSelect;

export interface SocialSweepCounts {
  claimed: number;
  posted: number;
  failed: number;
  manual: number;
  rateLimited: number;
}

/**
 * Queue a listing for every enabled platform.
 *
 * Idempotent by construction: the unique (listing_id, platform) index turns a
 * second consent, a replayed webhook or a re-publish into a no-op rather than a
 * duplicate post.
 *
 * Only ever called for a listing that is already `active` — enqueueing a
 * pending listing would post a URL that 404s.
 */
export async function enqueueSocialPosts(listingId: number): Promise<number> {
  if (!isFeatureEnabled('enableSocialAutoPublish')) return 0;

  const platforms = enabledPlatforms();
  if (!platforms.length) return 0;

  const rows = await db
    .insert(listingSocialPosts)
    .values(platforms.map((platform) => ({ listingId, platform })))
    .onConflictDoNothing()
    .returning({ id: listingSocialPosts.id });

  return rows.length;
}

/**
 * Claim a batch of due rows under a lease.
 *
 * Picks up `queued` rows plus `running` rows whose lease expired — a run that
 * died mid-post releases its work automatically.
 */
async function claimPosts(limit: number): Promise<SocialPostRow[]> {
  const rows = await db.execute(sql`
    UPDATE listing_social_posts SET
      status = 'running',
      lease_until = now() + make_interval(mins => ${SOCIAL_LEASE_MINUTES}),
      attempts = attempts + 1,
      updated_at = now()
    WHERE id IN (
      SELECT id FROM listing_social_posts
      WHERE status = 'queued'
         OR (status = 'running' AND lease_until < now())
      ORDER BY created_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `);

  // RETURNING id, then re-read through the query builder — exactly as
  // claimListings does. A raw `db.execute` yields the database's own snake_case
  // column names, so `RETURNING *` cast to the row type silently produces
  // `undefined` for every camelCase field (listingId, remotePostId, …).
  const ids = (rows as unknown as Array<{ id: number }>).map((r) => r.id);
  if (!ids.length) return [];
  return db.query.listingSocialPosts.findMany({
    where: inArray(listingSocialPosts.id, ids),
  });
}

/** Give a rate-limited row back to the queue WITHOUT spending the attempt. */
async function releaseForRateLimit(row: SocialPostRow, reason: string): Promise<void> {
  await db
    .update(listingSocialPosts)
    .set({
      status: 'queued',
      leaseUntil: null,
      // The attempt was consumed by the claim; hand it back, because the job
      // never actually got its turn.
      attempts: Math.max(0, row.attempts - 1),
      error: reason,
      updatedAt: new Date(),
    })
    .where(eq(listingSocialPosts.id, row.id));
}

async function recordFailure(
  row: SocialPostRow,
  error: string,
  retriable: boolean
): Promise<'failed' | 'requeued'> {
  const exhausted = !retriable || row.attempts >= SOCIAL_MAX_ATTEMPTS;
  await db
    .update(listingSocialPosts)
    .set({
      status: exhausted ? 'failed' : 'queued',
      leaseUntil: null,
      error: error.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(eq(listingSocialPosts.id, row.id));

  if (exhausted) {
    await createNotificationsForOpsAndAdmin({
      type: 'social_publish',
      title: `Listing #${row.listingId}: ${row.platform} post failed`,
      body: error.slice(0, 300),
      link: '/back-office/social',
    }).catch(() => {});
  }
  return exhausted ? 'failed' : 'requeued';
}

/**
 * Publish one claimed row.
 *
 * Returns the bucket it landed in so the sweeper can report counts without
 * re-reading the row.
 */
interface PublishOptions {
  /** Creator-selected privacy (TikTok). Absent on the cron path. */
  privacyLevel?: string;
}

async function publishOne(
  row: SocialPostRow,
  options: PublishOptions = {}
): Promise<keyof Omit<SocialSweepCounts, 'claimed'>> {
  const platform = row.platform as SocialPlatform;
  const adapter = adapterFor(platform);

  if (!adapter || !isPlatformEnabled(platform)) {
    // The platform was switched off after the row was queued. Not a failure —
    // just stop carrying it.
    await db
      .update(listingSocialPosts)
      .set({ status: 'skipped', leaseUntil: null, error: 'Platform disabled', updatedAt: new Date() })
      .where(eq(listingSocialPosts.id, row.id));
    return 'manual';
  }

  const listing = await db.query.listings.findFirst({
    where: eq(listings.id, row.listingId),
  });

  // Never publish a listing that is no longer live. Between consent and this
  // tick it may have been archived, held or rented out.
  if (!listing || listing.status !== 'active') {
    await db
      .update(listingSocialPosts)
      .set({
        status: 'skipped',
        leaseUntil: null,
        error: `Listing no longer active (${listing?.status ?? 'deleted'})`,
        updatedAt: new Date(),
      })
      .where(eq(listingSocialPosts.id, row.id));
    return 'manual';
  }

  const caption = buildCaption(platform, listing as CaptionListing, { baseUrl: baseUrl() });
  const imageUrls = socialImageUrls(listing);

  const result = await adapter.publish({
    listingId: listing.id,
    caption,
    imageUrls,
    listingUrl: `${baseUrl()}/listings/${listing.id}`,
    privacyLevel: options.privacyLevel,
  });

  if (result.ok) {
    // An unconfigured adapter reports success without sending anything (see the
    // dry-run branch in each adapter). Say so in the row: `posted` with no note
    // reads as a real post, and ops offered a takedown button for something that
    // was never published. The UI derives its badge from the `dryrun-` id, but
    // this note is what a human actually reads.
    const dryRun = !adapter.isConfigured();
    await db
      .update(listingSocialPosts)
      .set({
        status: 'posted',
        remotePostId: result.remotePostId,
        remotePermalink: result.permalink ?? null,
        caption,
        error:
          result.note ??
          (dryRun
            ? `DRY RUN — ${platform} has no credentials configured, so nothing was sent.`
            : null),
        postedAt: new Date(),
        leaseUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(listingSocialPosts.id, row.id));

    // logAudit rather than logListingAction: this publish is system-initiated,
    // and there may be no user to attribute it to. `audit_logs.user_id` is
    // nullable but FK-constrained, so the usual `?? 0` fallback violates the FK
    // and the row is silently dropped — which would leave no audit trail at all
    // for intake listings, the exact ones this feature is built for.
    await logAudit({
      action: 'listing_social_published',
      entityType: 'listing',
      entityId: listing.id,
      userId: listing.createdBy ?? undefined,
      metadata: { platform, remotePostId: result.remotePostId },
    }).catch(() => {});
    return 'posted';
  }

  // Facebook Group: there is no API, so "failure" here is the expected result.
  // Park the caption for a human instead of retrying something impossible.
  if (result.error.startsWith(MANUAL_ONLY_PREFIX)) {
    await db
      .update(listingSocialPosts)
      .set({
        status: 'skipped',
        caption,
        error: result.error.slice(MANUAL_ONLY_PREFIX.length).trim(),
        leaseUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(listingSocialPosts.id, row.id));

    await createNotificationsForOpsAndAdmin({
      type: 'social_publish',
      title: `Facebook Group draft ready — listing #${listing.id}`,
      body: `"${listing.title}" is approved for sharing. Copy the caption from Back Office → Social and post it to the group.`,
      link: '/back-office/social',
    }).catch(() => {});
    return 'manual';
  }

  if (result.rateLimited) {
    await releaseForRateLimit(row, result.error);
    return 'rateLimited';
  }

  // Keep the caption even on failure — ops can post it by hand.
  await db
    .update(listingSocialPosts)
    .set({ caption, updatedAt: new Date() })
    .where(eq(listingSocialPosts.id, row.id));
  const outcome = await recordFailure(row, result.error, result.retriable);
  return outcome === 'failed' ? 'failed' : 'rateLimited';
}

export interface PublishNowResult {
  ok: boolean;
  outcome: keyof Omit<SocialSweepCounts, 'claimed'>;
  /** The row, re-read after publishing, so the caller can show what happened. */
  post: SocialPostRow | null;
}

/**
 * Post ONE listing to ONE platform right now, on an operator's explicit click.
 *
 * Deliberately routed through the same `publishOne` as the cron sweeper. The
 * recording rules are subtle and safety-relevant — the dry-run note, the
 * `skipped` transition when a listing is no longer active, the audit entry, the
 * Facebook-Group manual park — and a second copy of them would drift. The only
 * difference is that a human chose the privacy level and is waiting for the
 * answer.
 *
 * Claims the row the same way too, so a cron tick running concurrently cannot
 * pick up the same row and double-post.
 */
export async function publishNow(
  listingId: number,
  platform: SocialPlatform,
  options: PublishOptions = {}
): Promise<PublishNowResult> {
  // Reuse the existing row when there is one — the unique (listing_id,
  // platform) index means this is an upsert, not a duplicate.
  await db
    .insert(listingSocialPosts)
    .values({ listingId, platform })
    .onConflictDoNothing();

  const existing = await db.query.listingSocialPosts.findFirst({
    where: and(
      eq(listingSocialPosts.listingId, listingId),
      eq(listingSocialPosts.platform, platform)
    ),
  });
  if (!existing) return { ok: false, outcome: 'failed', post: null };

  /*
   * Take the row under a lease, exactly as claimPosts does, and only if it is
   * not already being worked. A concurrent cron tick holding a live lease means
   * this post is already going out; racing it would publish twice.
   */
  const claimed = await db
    .update(listingSocialPosts)
    .set({
      status: 'running',
      leaseUntil: new Date(Date.now() + SOCIAL_LEASE_MINUTES * 60_000),
      attempts: existing.attempts + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(listingSocialPosts.id, existing.id),
        // `posted` is excluded on purpose: re-posting from this screen would
        // put a second copy on the account with no way to tell them apart.
        inArray(listingSocialPosts.status, ['queued', 'failed', 'skipped']),
        or(isNull(listingSocialPosts.leaseUntil), sql`lease_until < now()`)
      )
    )
    .returning({ id: listingSocialPosts.id });

  if (!claimed.length) {
    return { ok: false, outcome: 'manual', post: existing };
  }

  const row = await db.query.listingSocialPosts.findFirst({
    where: eq(listingSocialPosts.id, existing.id),
  });
  if (!row) return { ok: false, outcome: 'failed', post: null };

  const outcome = await publishOne(row, options);
  const after = await db.query.listingSocialPosts.findFirst({
    where: eq(listingSocialPosts.id, existing.id),
  });

  return { ok: outcome === 'posted', outcome, post: after ?? null };
}

/** One sweeper pass. Called by /api/cron/publish-social. */
export async function sweepSocialQueue(): Promise<SocialSweepCounts> {
  const counts: SocialSweepCounts = {
    claimed: 0,
    posted: 0,
    failed: 0,
    manual: 0,
    rateLimited: 0,
  };
  if (!isFeatureEnabled('enableSocialAutoPublish')) return counts;

  const startedAt = Date.now();
  const rows = await claimPosts(SOCIAL_BATCH_SIZE);
  counts.claimed = rows.length;

  for (const row of rows) {
    if (Date.now() - startedAt > SOCIAL_RUN_BUDGET_MS) {
      // Out of wall clock. Release the rest so the next tick takes them rather
      // than waiting for the lease to lapse.
      await db
        .update(listingSocialPosts)
        .set({ status: 'queued', leaseUntil: null, updatedAt: new Date() })
        .where(and(eq(listingSocialPosts.id, row.id), eq(listingSocialPosts.status, 'running')));
      continue;
    }
    try {
      counts[await publishOne(row)]++;
    } catch (err) {
      console.error('[social] publish threw', row.id, err);
      await recordFailure(row, err instanceof Error ? err.message : 'Unknown error', true).catch(
        () => {}
      );
      counts.failed++;
    }
  }

  if (counts.claimed) {
    console.log(
      `[social] swept — claimed ${counts.claimed}, posted ${counts.posted}, failed ${counts.failed}, manual ${counts.manual}, deferred ${counts.rateLimited}`
    );
  }
  return counts;
}

/**
 * Mark everything a listing has live as needing takedown.
 *
 * Called when a listing leaves `active` — archived by its owner over WhatsApp,
 * archived by ops, or purged. A landlord who deletes their listing must not
 * stay on our Instagram, and only Facebook can actually be deleted through the
 * API, so the rest become explicit manual tasks rather than silent orphans.
 */
export async function pullDownForListing(listingId: number, reason: string): Promise<number> {
  const live = await db.query.listingSocialPosts.findMany({
    where: and(
      eq(listingSocialPosts.listingId, listingId),
      eq(listingSocialPosts.status, 'posted')
    ),
  });
  if (!live.length) return 0;

  const manual: string[] = [];
  for (const row of live) {
    const adapter = adapterFor(row.platform as SocialPlatform);
    // A dry run never reached the platform, so there is nothing to take down
    // and nobody to ask. Sending ops to "delete this Instagram post by hand"
    // for a post that was never sent is the same lie as a row reading `posted`
    // for one — the thing the dry-run badge exists to prevent, one layer up.
    const dryRun = isDryRunPost(row.remotePostId);
    let removed = dryRun;
    if (!dryRun && adapter?.supportsRemove && row.remotePostId) {
      removed = await adapter.remove(row.remotePostId).catch(() => false);
    }
    if (!removed) manual.push(row.platform);

    await db
      .update(listingSocialPosts)
      .set({
        status: 'pulled',
        pulledAt: new Date(),
        // The post is still on the platform unless `remove()` actually removed
        // it. A dry run set `removed` true above precisely because there is
        // nothing out there to take down.
        needsManualTakedown: !removed,
        error: dryRun
          ? `${reason} — was a dry run, nothing had been sent`
          : removed
            ? reason
            : `${reason} — REMOVE BY HAND (no delete API)`,
        updatedAt: new Date(),
      })
      .where(eq(listingSocialPosts.id, row.id));
  }

  // Also stop anything that has not gone out yet.
  await db
    .update(listingSocialPosts)
    .set({ status: 'skipped', leaseUntil: null, error: reason, updatedAt: new Date() })
    .where(
      and(
        eq(listingSocialPosts.listingId, listingId),
        inArray(listingSocialPosts.status, ['queued', 'running'])
      )
    );

  if (manual.length) {
    await createNotificationsForOpsAndAdmin({
      type: 'social_publish',
      title: `Listing #${listingId}: remove ${manual.join(' + ')} post(s) by hand`,
      body: `${reason}. These platforms have no delete API — open the permalink in Back Office → Social and delete the post.`,
      link: '/back-office/social',
    }).catch(() => {});
  }
  return live.length;
}

/**
 * Posts still live on our accounts for listings that are no longer live on ours.
 *
 * Every de-listing path is supposed to call `pullDownForListing`, and there are
 * a lot of them: the landlord's own delete page, the WhatsApp DELETE command,
 * the dashboard archive button, the ops PATCH, expiry, the purge cron. Relying
 * on all of them remembering is how listings #24 and #25 were archived on
 * 2026-08-23 with their Facebook posts left up — the access-link delete page
 * was the one that had never been wired.
 *
 * So this closes the class rather than the instance: whatever route took the
 * listing down, a post that outlives it is found here within one sweep. A
 * missed call becomes five minutes of over-exposure instead of forever.
 *
 * Ordered oldest-first and bounded, so a large back catalogue drains over
 * several ticks rather than blowing the run budget on one.
 */
export async function reconcileOrphanedSocialPosts(
  limit = 5
): Promise<{ listings: number; posts: number }> {
  const orphans = await db
    .select({ listingId: listingSocialPosts.listingId, status: listings.status })
    .from(listingSocialPosts)
    .innerJoin(listings, eq(listings.id, listingSocialPosts.listingId))
    .where(
      and(eq(listingSocialPosts.status, 'posted'), sql`${listings.status} <> 'active'`)
    )
    .groupBy(listingSocialPosts.listingId, listings.status)
    .orderBy(listingSocialPosts.listingId)
    .limit(limit);

  let posts = 0;
  for (const row of orphans) {
    posts += await pullDownForListing(
      row.listingId,
      `Listing is ${row.status} — post outlived the listing`
    ).catch((err) => {
      console.error('[social] orphan pull-down failed', row.listingId, err);
      return 0;
    });
  }
  return { listings: orphans.length, posts };
}

/**
 * Listings that went live but were never asked about social sharing.
 *
 * Same at-least-once insurance as `reconcileMissedAnnouncements`: the prompt is
 * sent at the end of a sweeper run and a run that dies loses it permanently,
 * with nothing to retry it. Scoped to a recent window so an undeliverable
 * number is not chased forever.
 */
export async function listingsAwaitingSocialPrompt(limit = 5, withinHours = 24) {
  const cutoff = new Date(Date.now() - withinHours * 60 * 60 * 1000);
  return db.query.listings.findMany({
    where: and(
      isNull(listings.socialPromptedAt),
      eq(listings.status, 'active'),
      isNotNull(listings.publishedAt),
      gt(listings.publishedAt, cutoff)
    ),
    limit,
  });
}
