/**
 * Moderation engine: claim queued listings, run the checks, process the
 * surviving photos, publish or hold.
 *
 * Runs from a cron sweeper rather than inline in POST/PUT /api/listings: a
 * 6-photo listing is ~8-12s of work (downloads + vision calls + sharp + uploads)
 * and the create request would time out. Both the web form and the WhatsApp
 * intake already converge on status='pending', so a queue needs no changes at
 * either call site.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { listings, listingModerations, whatsappIntakes } from '@/lib/db/schema';
import { getFeatureValue, isFeatureEnabled } from '@/lib/feature-flags';
import { logListingAction } from '@/lib/db/audit-logger';
import { processListingImage } from '@/lib/images/process';
import {
  derivePhotos,
  parseManifest,
  parsePhotos,
  manifestFromLegacyPhotos,
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
import { notifyModerationOutcome } from './notify';
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
    maxImages: Number(getFeatureValue('moderationMaxImagesPerListing') ?? 6),
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

/** Ensure a manifest exists; legacy rows get one built from `photos`. */
function ensureManifest(listing: ListingRow): PhotoManifestEntry[] {
  const existing = parseManifest(listing.photosManifest);
  if (existing.length) return existing;
  return manifestFromLegacyPhotos(parsePhotos(listing.photos));
}

export async function moderateListing(listing: ListingRow): Promise<ModerationVerdict> {
  const started = Date.now();
  const policy = policyFromFlags();
  const usage = { inputTokens: 0, outputTokens: 0 };
  let providerError: string | null = null;

  const manifest = ensureManifest(listing);
  const queued = manifest.filter((e) => e.v === 'queued');
  const alreadyKept = manifest.filter((e) => e.v === 'pass' || e.v === 'external');

  // Over the per-listing cap: drop the tail with an explicit reason rather than
  // silently ignoring it.
  const overCap = Math.max(0, queued.length + alreadyKept.length - policy.maxImages);
  const checkable = overCap > 0 ? queued.slice(0, Math.max(0, queued.length - overCap)) : queued;
  const cappedOut = queued.slice(checkable.length);

  // --- images -------------------------------------------------------------
  const imageVerdicts: ImageVerdict[] = [];
  const bytesByUrl = new Map<string, Buffer>();

  if (policy.moderateImages) {
    for (const entry of checkable) {
      const fetched = await fetchOriginal(entry.o);
      if (!fetched) {
        // Could not read the original: leave it alone rather than reject it.
        entry.v = 'skipped';
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
    }
  } else {
    // Images not checked: they still need processing, so fetch them anyway.
    for (const entry of checkable) {
      const fetched = await fetchOriginal(entry.o);
      if (!fetched) {
        entry.v = 'skipped';
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
  });

  if (cappedOut.length) {
    for (const e of cappedOut) {
      e.v = 'reject';
      e.r = `only ${policy.maxImages} photos can be published per listing`;
      e.sev = 'cosmetic';
      e.pv = PROMPT_VERSION;
    }
    verdict.reasons.push(`${cappedOut.length} photo(s) beyond the ${policy.maxImages}-photo cap.`);
  }

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

    // Counted, not just logged: when processing breaks for every photo the only
    // visible symptom used to be `p === o` deep inside the manifest JSON.
    let fallbacks = 0;
    let firstProcessingError: string | undefined;
    const noteFallback = (reason: string) => {
      fallbacks++;
      firstProcessingError ??= reason;
    };

    for (const entry of manifest) {
      const v = byUrl.get(entry.o);
      if (!v || v.verdict !== 'pass') continue;
      const bytes = bytesByUrl.get(entry.o);

      if (!processingOn) {
        // Publish the original as-is when processing is disabled. Not a
        // fallback — this is the configured behaviour.
        entry.v = 'pass';
        entry.p = entry.o;
        continue;
      }
      if (!bytes) {
        // Processing is on but we never held the bytes (a settled entry re-passed
        // from cache, or a fetch that failed). Publishable, but unprocessed.
        entry.v = 'pass';
        entry.p = entry.o;
        noteFallback('original bytes unavailable');
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
        if (!url) noteFallback('derived upload to storage failed');
      } catch (err) {
        console.error('[moderation] image processing failed', listing.id, err);
        entry.v = 'pass';
        entry.p = entry.o;
        noteFallback(err instanceof Error ? err.message : 'image processing threw');
      }
    }

    if (fallbacks) {
      verdict.processingFallbacks = fallbacks;
      verdict.processingError = firstProcessingError;
      verdict.reasons.push(
        `${fallbacks} photo(s) published UNPROCESSED (no compression/watermark): ${firstProcessingError}.`
      );
    }
  }

  await persist(listing, manifest, verdict);
  return verdict;
}

async function persist(
  listing: ListingRow,
  manifest: PhotoManifestEntry[],
  verdict: ModerationVerdict
): Promise<void> {
  const now = new Date();
  const publishable = derivePhotos(manifest);

  const base = {
    photosManifest: serializeManifest(manifest),
    photos: publishable.length ? JSON.stringify(publishable) : null,
    moderationSummary: summarize(verdict),
    moderationLanguage: verdict.language ?? null,
    moderatedAt: now,
    moderationLeaseUntil: null,
    updatedAt: now,
  };

  if (verdict.outcome === 'passed') {
    const autoPublish = isFeatureEnabled('autoPublishWhatsAppIntakes');
    const days = Number(getFeatureValue('listingExpirationDays') ?? 30);
    const goLive = autoPublish || listing.status === 'active';
    await db
      .update(listings)
      .set({
        ...base,
        moderationStatus: 'passed',
        ...(goLive
          ? {
              status: 'active' as const,
              publishedAt: listing.publishedAt ?? now,
              expiresAt:
                listing.expiresAt ?? new Date(now.getTime() + days * 24 * 60 * 60 * 1000),
            }
          : { status: 'pending' as const }),
      })
      .where(eq(listings.id, listing.id));
  } else if (verdict.outcome === 'error') {
    // Retry until the cap, then hold so the queue can't spin forever.
    const exhausted = (listing.moderationAttempts ?? 0) >= MODERATION_MAX_ATTEMPTS;
    await db
      .update(listings)
      .set({ ...base, moderationStatus: exhausted ? 'held' : 'queued' })
      .where(eq(listings.id, listing.id));
  } else {
    await db
      .update(listings)
      .set({ ...base, moderationStatus: 'held', status: 'pending' })
      .where(eq(listings.id, listing.id));
  }

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
    await notifyModerationOutcome(listing, verdict);
  } catch (err) {
    console.error('[moderation] post-decision follow-up failed', listing.id, err);
  }
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
