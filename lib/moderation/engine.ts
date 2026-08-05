/**
 * Moderation engine: claim queued listings, run the checks, process the
 * surviving photos, publish or hold.
 *
 * Runs from a cron sweeper rather than inline in POST/PUT /api/listings: a
 * 6-photo listing is ~8-12s of work (downloads + vision calls + sharp + uploads)
 * and the create request would time out.
 *
 * The sweeper keys off `moderation_status`, NOT `status` — so EVERY write that
 * creates a listing or adds a photo must set `moderation_status='queued'` or
 * the work is never picked up. An earlier version of this comment claimed both
 * call sites "already converge on status='pending', so a queue needs no changes",
 * which is how WhatsApp listings published unchecked for weeks.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { listings, listingModerations, whatsappIntakes } from '@/lib/db/schema';
import { getFeatureValue, isFeatureEnabled } from '@/lib/feature-flags';
import { logListingAction } from '@/lib/db/audit-logger';
import { processListingImage } from '@/lib/images/process';
import { photoCap } from '@/lib/images/cap';
import {
  adoptOrphanPhotos,
  derivePhotos,
  mergeRunIntoFresh,
  parseManifest,
  parsePhotos,
  serializeManifest,
} from '@/lib/images/manifest';
import { fetchOriginal, hashBytes, storeDerived } from '@/lib/images/store';
import type { PhotoManifestEntry } from '@/lib/images/types';
import {
  MODERATION_BATCH_SIZE,
  MODERATION_MAX_ATTEMPTS,
  MODERATION_RUN_BUDGET_MS,
  isModerationConfigured,
} from './config';
import { checkImage } from './image-check';
import { checkText } from './text-check';
import { combine, summarize } from './verdict';
import { PROMPT_VERSION } from './prompts';
import { MODERATION_IMAGE_MODEL } from './config';
import { notifyModerationOutcome, type ModerationNotifyContext } from './notify';
import type { ImageVerdict, ModerationPolicy, ModerationVerdict } from './types';

export interface SweepCounts {
  claimed: number;
  passed: number;
  held: number;
  errored: number;
  skipped: number;
}

type ListingRow = typeof listings.$inferSelect;

function policyFromFlags(): ModerationPolicy {
  return {
    moderateImages: isFeatureEnabled('moderateImages'),
    moderateTextCoherence: isFeatureEnabled('moderateTextCoherence'),
    holdOnUnsafeImages: isFeatureEnabled('holdOnUnsafeImages'),
    failOpen: isFeatureEnabled('moderationFailOpen'),
    // Same number the upload paths enforce — see lib/images/cap.ts for why the
    // cost ceiling is derived from the publish cap rather than configured apart.
    maxImages: photoCap(),
  };
}

/**
 * Claim work with a lease. FOR UPDATE SKIP LOCKED plus an expiring lease means
 * overlapping cron runs never process the same listing and a crashed run
 * self-heals without a separate reaper.
 */
export async function claimListings(limit: number): Promise<ListingRow[]> {
  const rows = await db.execute(sql`
    UPDATE listings SET
      moderation_status = 'running',
      moderation_lease_until = now() + interval '5 minutes',
      moderation_attempts = moderation_attempts + 1
    WHERE id IN (
      SELECT id FROM listings
      WHERE moderation_status = 'queued'
         OR (moderation_status = 'running' AND moderation_lease_until < now())
      ORDER BY created_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `);

  const ids = (rows as unknown as Array<{ id: number }>).map((r) => r.id);
  if (!ids.length) return [];
  return db.query.listings.findMany({ where: inArray(listings.id, ids) });
}

/**
 * The manifest, guaranteed to cover every currently-published photo.
 *
 * Deliberately NOT "only when the manifest is empty": a partially-covering
 * manifest is the dangerous case, because persist() rewrites `photos` from
 * whatever this returns. A live listing with 8 photos and 1 entry would lose 7.
 */
function ensureManifest(listing: ListingRow): PhotoManifestEntry[] {
  return adoptOrphanPhotos(parseManifest(listing.photosManifest), parsePhotos(listing.photos))
    .entries;
}

export async function moderateListing(listing: ListingRow): Promise<ModerationVerdict> {
  const started = Date.now();
  const policy = policyFromFlags();
  const usage = { inputTokens: 0, outputTokens: 0 };
  let providerError: string | null = null;

  const manifest = ensureManifest(listing);
  const queued = manifest.filter((e) => e.v === 'queued');
  const alreadyKept = manifest.filter((e) => e.v === 'pass' || e.v === 'external');
  // Captured before the loops mutate them: queued with no publishable URL means
  // "arrived since the last run and not yet visible".
  const newlyArrived = queued.filter((e) => !e.p);

  // Over the per-listing cap: refuse the tail with an explicit reason rather
  // than silently ignoring it. Newest-first, so an existing gallery is never
  // displaced by a late arrival.
  const overCap = Math.max(0, queued.length + alreadyKept.length - policy.maxImages);
  const checkable = overCap > 0 ? queued.slice(0, Math.max(0, queued.length - overCap)) : queued;
  const cappedOut = queued.slice(checkable.length);

  // --- images -------------------------------------------------------------
  const imageVerdicts: ImageVerdict[] = [];
  const bytesByUrl = new Map<string, Buffer>();
  // Which originals this run actually judged. persist() applies run verdicts
  // ONLY to these, so a photo that arrived mid-run keeps its own state.
  const evaluated = new Set<string>();

  if (policy.moderateImages) {
    for (const entry of checkable) {
      const fetched = await fetchOriginal(entry.o);
      if (!fetched) {
        // Could not read the original: leave it alone rather than reject it,
        // but say so — a silently vanishing photo is worse than a bad one.
        entry.v = 'skipped';
        entry.r = 'we could not read this image — please send it again';
        evaluated.add(entry.o);
        continue;
      }
      bytesByUrl.set(entry.o, fetched.buffer);
      const hash = hashBytes(fetched.buffer);
      entry.h = hash;

      const outcome = await checkImage({ originalUrl: entry.o, contentHash: hash, bytes: fetched.buffer });
      usage.inputTokens += outcome.usage.inputTokens;
      usage.outputTokens += outcome.usage.outputTokens;
      if (outcome.error && outcome.error !== 'not_configured') providerError ??= outcome.error;
      imageVerdicts.push(outcome.verdict);
      evaluated.add(entry.o);
    }
  } else {
    // Images not checked: they still need processing, so fetch them anyway.
    for (const entry of checkable) {
      const fetched = await fetchOriginal(entry.o);
      if (!fetched) {
        entry.v = 'skipped';
        entry.r = 'we could not read this image — please send it again';
        evaluated.add(entry.o);
        continue;
      }
      bytesByUrl.set(entry.o, fetched.buffer);
      entry.h = hashBytes(fetched.buffer);
      imageVerdicts.push({
        originalUrl: entry.o,
        contentHash: entry.h,
        verdict: 'pass',
        reasons: [],
        fromCache: false,
      });
      evaluated.add(entry.o);
    }
  }

  // --- text ---------------------------------------------------------------
  let textVerdict = null;
  if (policy.moderateTextCoherence) {
    const outcome = await checkText({
      title: listing.title,
      description: listing.description,
      address: listing.address,
      city: listing.city,
      district: listing.district,
      latitude: listing.latitude,
      longitude: listing.longitude,
    });
    usage.inputTokens += outcome.usage.inputTokens;
    usage.outputTokens += outcome.usage.outputTokens;
    if (outcome.error && outcome.error !== 'not_configured') providerError ??= outcome.error;
    textVerdict = outcome.verdict;
  }

  // Cap refusals go INTO combine, not onto the verdict afterwards: stitched on
  // later they never reached droppedUrls or the landlord message, so a refused
  // photo vanished under a "published!" reply.
  for (const e of cappedOut) {
    e.v = 'reject';
    e.r = `only ${policy.maxImages} photos can be published per listing`;
    e.sev = 'cosmetic';
    e.p = null;
    e.pv = PROMPT_VERSION;
    evaluated.add(e.o);
  }

  const verdict = combine({
    text: textVerdict,
    images: imageVerdicts,
    policy,
    model: MODERATION_IMAGE_MODEL,
    promptVersion: PROMPT_VERSION,
    usage,
    durationMs: Date.now() - started,
    providerError,
    existingKeptUrls: alreadyKept.map((e) => e.p ?? e.o),
    cappedOutUrls: cappedOut.map((e) => e.o),
  });

  // --- apply verdicts to the manifest ------------------------------------
  const byUrl = new Map(imageVerdicts.map((v) => [v.originalUrl, v]));
  for (const entry of manifest) {
    const v = byUrl.get(entry.o);
    if (!v) continue;
    entry.h = v.contentHash;
    entry.pv = PROMPT_VERSION;
    if (v.verdict === 'reject') {
      entry.v = 'reject';
      entry.r = v.reasons[0];
      entry.sev = v.severity;
      entry.p = null;
    }
  }

  // --- process + publish survivors ---------------------------------------
  // Only on a passing verdict: a held listing must publish nothing.
  if (verdict.outcome === 'passed') {
    const processingOn = isFeatureEnabled('enableImageProcessing');
    const watermark = isFeatureEnabled('watermarkListingImages');

    for (const entry of manifest) {
      const v = byUrl.get(entry.o);
      if (!v || v.verdict !== 'pass') continue;
      const bytes = bytesByUrl.get(entry.o);

      if (!processingOn || !bytes) {
        // Publish the original as-is when processing is disabled.
        entry.v = 'pass';
        entry.p = entry.o;
        continue;
      }
      try {
        const processed = await processListingImage(bytes, {
          whatsappSourced: Boolean(entry.wa),
          watermark,
        });
        const url = await storeDerived(listing.id, entry.h ?? hashBytes(bytes), processed);
        entry.v = 'pass';
        entry.p = url ?? entry.o; // upload failed → fall back to the original
      } catch (err) {
        console.error('[moderation] image processing failed', listing.id, err);
        entry.v = 'pass';
        entry.p = entry.o;
      }
    }
  }

  // Photos that were NOT public when this run started (queued with no derived
  // URL) and passed: the count that makes an incremental "2 photos are now on
  // your listing" message honest.
  const added = newlyArrived.filter((e) => e.v === 'pass' && e.p).length;

  return persist(listing, manifest, verdict, evaluated, {
    // First publish vs an incremental re-check of a live listing — decides
    // whether the landlord hears "🎉 now live" or "photos added".
    wasLive: listing.status === 'active' && listing.publishedAt !== null,
    added,
    refused: cappedOut.length,
  });
}

/**
 * Commit the run against the row AS IT STANDS NOW.
 *
 * A run takes seconds; a WhatsApp album or a landlord edit can land meanwhile.
 * So the row is re-read under FOR UPDATE and merged (fresh row owns membership,
 * the run owns verdicts for what it evaluated) rather than blind-overwritten.
 */
async function persist(
  listing: ListingRow,
  runManifest: PhotoManifestEntry[],
  verdict: ModerationVerdict,
  evaluated: Set<string>,
  ctx: ModerationNotifyContext
): Promise<ModerationVerdict> {
  const now = new Date();
  const autoPublish = isFeatureEnabled('autoPublishWhatsAppIntakes');
  const days = Number(getFeatureValue('listingExpirationDays') ?? 30);

  await db.transaction(async (tx) => {
    const [fresh] = await tx
      .select()
      .from(listings)
      .where(eq(listings.id, listing.id))
      .for('update');
    if (!fresh) return;

    const freshPhotos = parsePhotos(fresh.photos);
    const { entries, unevaluatedQueued } = mergeRunIntoFresh(
      adoptOrphanPhotos(parseManifest(fresh.photosManifest), freshPhotos).entries,
      runManifest,
      evaluated,
      freshPhotos
    );
    const publishable = derivePhotos(entries);

    // A URL may only leave the gallery for a reason we can name. Anything else
    // is a bug, and losing a landlord's photo is worse than stalling the queue.
    const retracted = freshPhotos.filter((u) => !publishable.includes(u));
    const unexplained = retracted.filter((u) => {
      const entry = entries.find((e) => e.o === u || e.p === u);
      return !entry || (entry.v !== 'reject' && entry.p === u);
    });
    if (unexplained.length) {
      console.error(
        '[moderation] refusing to retract photos without a reason',
        listing.id,
        unexplained
      );
      await tx
        .update(listings)
        .set({
          photosManifest: serializeManifest(entries),
          moderationStatus: 'error',
          moderationSummary: `Refused to unpublish ${unexplained.length} photo(s) with no verdict`,
          moderationLeaseUntil: null,
          updatedAt: now,
        })
        .where(eq(listings.id, listing.id));
      verdict.outcome = 'error';
      verdict.errorMessage = 'unexplained photo retraction';
      return;
    }

    const base = {
      photosManifest: serializeManifest(entries),
      photos: publishable.length ? JSON.stringify(publishable) : null,
      moderationSummary: summarize(verdict),
      moderationLanguage: verdict.language ?? null,
      moderatedAt: now,
      moderationLeaseUntil: null,
      updatedAt: now,
    };

    if (verdict.outcome === 'passed') {
      const goLive = autoPublish || fresh.status === 'active';
      await tx
        .update(listings)
        .set({
          ...base,
          // A photo that arrived mid-run still needs checking, so go back in
          // the queue rather than claiming the listing is done.
          moderationStatus: unevaluatedQueued > 0 ? 'queued' : 'passed',
          // The retry cap counts CONSECUTIVE failures; a successful pass clears it.
          moderationAttempts: 0,
          ...(goLive
            ? {
                status: 'active' as const,
                publishedAt: fresh.publishedAt ?? now,
                expiresAt:
                  fresh.expiresAt ?? new Date(now.getTime() + days * 24 * 60 * 60 * 1000),
              }
            : { status: 'pending' as const }),
        })
        .where(eq(listings.id, listing.id));
    } else if (verdict.outcome === 'error') {
      // Retry until the cap, then hold so the queue can't spin forever.
      const exhausted = (listing.moderationAttempts ?? 0) >= MODERATION_MAX_ATTEMPTS;
      await tx
        .update(listings)
        .set({ ...base, moderationStatus: exhausted ? 'held' : 'queued' })
        .where(eq(listings.id, listing.id));
    } else {
      // Only an unsafe image may take an ALREADY-LIVE listing dark. A flaky
      // text check must not unpublish a live listing because a landlord sent
      // another photo — the text did not change.
      const wasLive = fresh.status === 'active' && fresh.publishedAt !== null;
      const takeDark = !wasLive || verdict.holdReason === 'unsafe_image';
      await tx
        .update(listings)
        .set({
          ...base,
          moderationStatus: 'held',
          ...(takeDark ? { status: 'pending' as const } : {}),
        })
        .where(eq(listings.id, listing.id));
    }
  });

  try {
    await db.insert(listingModerations).values({
      listingId: listing.id,
      attempt: listing.moderationAttempts ?? 1,
      outcome: verdict.outcome === 'skipped' ? 'skipped' : verdict.outcome,
      language: verdict.language ?? null,
      verdict: JSON.stringify(verdict),
      reasons: JSON.stringify(verdict.reasons),
      imagesChecked: verdict.images.length,
      imagesDropped: verdict.droppedUrls.length,
      imagesCached: verdict.images.filter((i) => i.fromCache).length,
      model: verdict.model,
      promptVersion: verdict.promptVersion,
      inputTokens: verdict.usage.inputTokens,
      outputTokens: verdict.usage.outputTokens,
      durationMs: verdict.durationMs,
      errorMessage: verdict.errorMessage ?? null,
    });
  } catch (err) {
    console.error('[moderation] ledger insert failed', err);
  }

  // Everything past here is best-effort: the decision is already committed.
  try {
    if (verdict.outcome === 'passed') {
      await logListingAction('listing_moderation_passed', listing.id, listing.createdBy ?? 0, {
        dropped: verdict.droppedUrls.length,
        language: verdict.language,
      });
      if (verdict.droppedUrls.length) {
        await logListingAction('listing_photos_dropped', listing.id, listing.createdBy ?? 0, {
          count: verdict.droppedUrls.length,
        });
      }
    } else if (verdict.outcome === 'held') {
      await logListingAction('listing_moderation_held', listing.id, listing.createdBy ?? 0, {
        reasons: verdict.reasons.slice(0, 3),
      });
    }
    await notifyModerationOutcome(listing, verdict, ctx);
  } catch (err) {
    console.error('[moderation] post-decision follow-up failed', listing.id, err);
  }

  return verdict;
}

/** Cron entry point. */
export async function sweepModerationQueue(): Promise<SweepCounts> {
  const counts: SweepCounts = { claimed: 0, passed: 0, held: 0, errored: 0, skipped: 0 };

  if (!isFeatureEnabled('enableListingModeration') || !isModerationConfigured()) {
    // Feature off or no key: leave the queue untouched and mark nothing.
    return counts;
  }

  const started = Date.now();
  const batch = await claimListings(MODERATION_BATCH_SIZE);
  counts.claimed = batch.length;

  for (const listing of batch) {
    if (Date.now() - started > MODERATION_RUN_BUDGET_MS) {
      // Out of budget: release the lease so the next run picks it up.
      await db
        .update(listings)
        .set({ moderationStatus: 'queued', moderationLeaseUntil: null })
        .where(eq(listings.id, listing.id));
      continue;
    }
    try {
      const verdict = await moderateListing(listing);
      if (verdict.outcome === 'passed') counts.passed++;
      else if (verdict.outcome === 'held') counts.held++;
      else if (verdict.outcome === 'error') counts.errored++;
      else counts.skipped++;
    } catch (err) {
      console.error('[moderation] listing failed', listing.id, err);
      counts.errored++;
      const exhausted = (listing.moderationAttempts ?? 0) >= MODERATION_MAX_ATTEMPTS;
      await db
        .update(listings)
        .set({
          moderationStatus: exhausted ? 'held' : 'queued',
          moderationSummary: `Moderation crashed: ${err instanceof Error ? err.message : 'unknown'}`.slice(0, 200),
          moderationLeaseUntil: null,
        })
        .where(eq(listings.id, listing.id))
        .catch(() => {});
    }
  }

  return counts;
}
