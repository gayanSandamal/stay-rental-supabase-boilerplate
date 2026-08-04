/**
 * Per-image moderation: cache lookup → gate call → adjudication only when the
 * gate is unsure → cache write.
 *
 * The image is ALWAYS the original (never the watermarked derivative), because
 * showing the model our own logo would trip the "text added to image" check on
 * every photo. See lib/images/process.ts.
 */

import sharp from 'sharp';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { imageModerationCache } from '@/lib/db/schema';
import { chatJson } from './client';
import {
  MODERATION_ADJUDICATE_MODEL,
  MODERATION_IMAGE_EDGE,
  MODERATION_IMAGE_MODEL,
} from './config';
import { IMAGE_ADJUDICATE_SYSTEM, IMAGE_GATE_SYSTEM, PROMPT_VERSION, REASON_COPY } from './prompts';
import type { BoundingBox, ImageVerdict, Severity } from './types';

interface GateResponse {
  unsafe?: boolean;
  unsafe_category?: string | null;
  overlay_text?: boolean;
  overlay_text_sample?: string | null;
  scene_text_present?: boolean;
  person_visible?: boolean;
  faces?: BoundingBox[];
  is_property_photo?: boolean;
  uncertain?: boolean;
  confidence?: number;
  notes?: string | null;
}

interface AdjudicateResponse {
  overlay_text?: boolean;
  overlay_text_sample?: string | null;
  reasoning?: string;
  person_is_subject?: boolean;
  confidence?: number;
}

export interface ImageCheckOutcome {
  verdict: ImageVerdict;
  usage: { inputTokens: number; outputTokens: number };
  /** Transport failure — the caller decides fail-open vs fail-closed. */
  error: string | null;
}

/** Downscale for the model: visual tokens are the cost driver. */
async function prepareForModel(original: Buffer): Promise<{ buffer: Buffer; mimeType: string }> {
  const buffer = await sharp(original)
    .rotate()
    .resize({
      width: MODERATION_IMAGE_EDGE,
      height: MODERATION_IMAGE_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 88 })
    .toBuffer();
  return { buffer, mimeType: 'image/jpeg' };
}

async function readCache(contentHash: string) {
  return db.query.imageModerationCache.findFirst({
    where: and(
      eq(imageModerationCache.contentHash, contentHash),
      eq(imageModerationCache.promptVersion, PROMPT_VERSION)
    ),
  });
}

async function writeCache(row: {
  contentHash: string;
  verdict: 'pass' | 'reject';
  severity?: Severity;
  reasons: string[];
  raw: unknown;
  model: string;
}): Promise<void> {
  try {
    await db
      .insert(imageModerationCache)
      .values({
        contentHash: row.contentHash,
        promptVersion: PROMPT_VERSION,
        verdict: row.verdict,
        severity: row.severity ?? null,
        reasons: JSON.stringify(row.reasons),
        raw: JSON.stringify(row.raw ?? null),
        model: row.model,
      })
      .onConflictDoNothing();
  } catch (err) {
    // A cache write failure must never fail the listing.
    console.error('[moderation] cache write failed', err);
  }
}

/**
 * Judge one image. `contentHash` is the sha256 of the ORIGINAL bytes, which is
 * the cache key — so the same photo re-posted by anyone is free, and an ops
 * "restore this photo" override (human_override) is permanent.
 */
export async function checkImage(args: {
  originalUrl: string;
  contentHash: string;
  bytes: Buffer;
}): Promise<ImageCheckOutcome> {
  const { originalUrl, contentHash, bytes } = args;
  const usage = { inputTokens: 0, outputTokens: 0 };

  const cached = await readCache(contentHash).catch(() => null);
  if (cached) {
    // An ops override always wins, whatever the model said.
    const verdict: 'pass' | 'reject' = cached.humanOverride ? 'pass' : (cached.verdict as 'pass' | 'reject');
    let reasons: string[] = [];
    try {
      reasons = JSON.parse(cached.reasons ?? '[]');
    } catch {
      reasons = [];
    }
    return {
      verdict: {
        originalUrl,
        contentHash,
        verdict,
        severity: (cached.severity as Severity) ?? undefined,
        reasons: verdict === 'pass' ? [] : reasons,
        fromCache: true,
      },
      usage,
      error: null,
    };
  }

  const prepared = await prepareForModel(bytes).catch(() => null);
  if (!prepared) {
    // Unreadable image: skip rather than reject — it may be a format quirk.
    return {
      verdict: { originalUrl, contentHash, verdict: 'pass', reasons: [], fromCache: false },
      usage,
      error: null,
    };
  }

  const gate = await chatJson<GateResponse>({
    model: MODERATION_IMAGE_MODEL,
    system: IMAGE_GATE_SYSTEM,
    user: 'Inspect this photo and return the JSON object.',
    images: [prepared],
    maxTokens: 400,
  });
  usage.inputTokens += gate.usage.inputTokens;
  usage.outputTokens += gate.usage.outputTokens;

  if (gate.error || !gate.data) {
    return {
      verdict: { originalUrl, contentHash, verdict: 'pass', reasons: [], fromCache: false },
      usage,
      error: gate.error ?? 'no_gate_result',
    };
  }

  const g = gate.data;
  let overlayText = Boolean(g.overlay_text);
  let personVisible = Boolean(g.person_visible);
  let adjudicated = false;

  // Only ambiguous images pay for the bigger model.
  const needsAdjudication = Boolean(g.uncertain) || (overlayText && Boolean(g.scene_text_present));
  if (needsAdjudication) {
    const adj = await chatJson<AdjudicateResponse>({
      model: MODERATION_ADJUDICATE_MODEL,
      system: IMAGE_ADJUDICATE_SYSTEM,
      user: 'Settle the questions for this photo and return the JSON object.',
      images: [prepared],
      maxTokens: 400,
    });
    usage.inputTokens += adj.usage.inputTokens;
    usage.outputTokens += adj.usage.outputTokens;
    if (adj.data) {
      adjudicated = true;
      overlayText = Boolean(adj.data.overlay_text);
      if (typeof adj.data.person_is_subject === 'boolean') {
        personVisible = adj.data.person_is_subject;
      }
    }
  }

  const reasons: string[] = [];
  let severity: Severity | undefined;

  if (g.unsafe) {
    severity = 'safety';
    reasons.push(REASON_COPY.unsafe);
  }
  if (overlayText) {
    severity ??= 'cosmetic';
    const sample = g.overlay_text_sample?.trim();
    reasons.push(
      sample && /\b(realty|properties|property|estate|agent|lanka|\.com|\.lk)\b/i.test(sample)
        ? REASON_COPY.otherWatermark
        : REASON_COPY.overlayText
    );
  }
  if (personVisible) {
    severity ??= 'cosmetic';
    reasons.push(REASON_COPY.person);
  }
  if (g.is_property_photo === false) {
    severity ??= 'cosmetic';
    reasons.push(REASON_COPY.notProperty);
  }

  const verdict: 'pass' | 'reject' = reasons.length ? 'reject' : 'pass';

  await writeCache({
    contentHash,
    verdict,
    severity,
    reasons,
    raw: { gate: g, adjudicated },
    model: adjudicated ? `${MODERATION_IMAGE_MODEL}+${MODERATION_ADJUDICATE_MODEL}` : MODERATION_IMAGE_MODEL,
  });

  return {
    verdict: {
      originalUrl,
      contentHash,
      verdict,
      severity,
      reasons,
      fromCache: false,
      faceBoxes: Array.isArray(g.faces) ? g.faces : [],
      raw: { gate: g, adjudicated },
    },
    usage,
    error: null,
  };
}
