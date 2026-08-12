/**
 * Moderation provider configuration.
 *
 * One provider does the whole pipeline: SiliconFlow serving Qwen3-VL, which is
 * OpenAI-chat-completions compatible. Qwen3-VL does visual safety
 * classification, grounded detection (it returns `bbox_2d` coordinates for text
 * and faces), spatial reasoning good enough to tell a photographed street sign
 * from an added watermark, and — being a Qwen LLM underneath — the text-only
 * language/coherence checks too.
 *
 * NB: Qwen2.5-VL-72B is deprecated on SiliconFlow; Qwen3-VL is the current
 * generation and is cheaper. Every model id is env-overridable so switching
 * tiers (or providers, since the wire format is OpenAI-compatible) is config.
 */

/** Test seam, mirroring WHATSAPP_GRAPH_API_BASE. Never set in production. */
export const MODERATION_API_BASE =
  process.env.MODERATION_API_BASE ?? 'https://api.siliconflow.com/v1';

/** Cheap workhorse: per-image gate and the text checks. */
export const MODERATION_IMAGE_MODEL =
  process.env.MODERATION_IMAGE_MODEL ?? 'Qwen/Qwen3-VL-8B-Instruct';

/**
 * Only for images the gate flagged — deciding whether text is physically in the
 * scene (a "For Rent" board, a street sign) or was added afterwards needs the
 * better reasoner. Most images never reach it.
 */
export const MODERATION_ADJUDICATE_MODEL =
  process.env.MODERATION_ADJUDICATE_MODEL ?? 'Qwen/Qwen3-VL-32B-Instruct';

export const MODERATION_TEXT_MODEL =
  process.env.MODERATION_TEXT_MODEL ?? 'Qwen/Qwen3-VL-8B-Instruct';

export const MODERATION_TIMEOUT_MS = Number(process.env.MODERATION_TIMEOUT_MS ?? 25_000);

/** Listings claimed per cron run. Memory-bound (sharp decodes), not time-bound. */
export const MODERATION_BATCH_SIZE = Number(process.env.MODERATION_BATCH_SIZE ?? 2);

/**
 * Leave the run before Vercel's maxDuration (60s) kills it mid-listing.
 *
 * This bounds the IMAGE loop only. Everything after it — the DB write, the
 * audit rows, the ops notification and the landlord's WhatsApp message — is
 * unbounded and runs on whatever time is left, which is why the gap to 60s has
 * to be generous. At 45s it was not: listing #14 (2026-08-12) wrote both audit
 * rows and then died inside notify, publishing a listing whose owner was never
 * told. The reconcile pass now repairs that, but the cheaper fix is to not run
 * out of clock in the first place.
 */
export const MODERATION_RUN_BUDGET_MS = Number(process.env.MODERATION_RUN_BUDGET_MS ?? 35_000);

/** Give up and hold the listing after this many failed attempts. */
export const MODERATION_MAX_ATTEMPTS = 3;

/**
 * Long edge we downscale to before sending an image to the model. Qwen3-VL
 * bills by visual tokens (~28x28 px per token), so this is the main cost lever;
 * 1280 keeps small overlaid text legible while staying ~2k tokens per image.
 */
export const MODERATION_IMAGE_EDGE = Number(process.env.MODERATION_IMAGE_EDGE ?? 1280);

export function moderationApiKey(): string | undefined {
  return process.env.SILICONFLOW_API_KEY || process.env.MODERATION_API_KEY || undefined;
}

/**
 * Absent key = the whole feature is a no-op (rows land as `skipped` and publish
 * exactly as they do today). This mirrors how enableLlmParserFallback is gated
 * and is what makes merging this safe before any key exists.
 */
export function isModerationConfigured(): boolean {
  return Boolean(moderationApiKey());
}
