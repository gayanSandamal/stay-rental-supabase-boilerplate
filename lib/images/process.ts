/**
 * Listing image processing: compress, strip metadata, watermark.
 *
 * ORDERING MATTERS AND IS NOT NEGOTIABLE: moderation reads the ORIGINAL, this
 * module runs only on images that already passed. Watermarking before the
 * "no text added to images" check would make the checker flag our own logo on
 * every photo. See lib/moderation/engine.ts.
 */

import type { Sharp } from 'sharp';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProcessedImage } from './types';

/**
 * Raised when sharp itself cannot be loaded — a packaging/deployment fault, not
 * a problem with any particular photo. Callers MUST treat the two differently:
 * one bad image is a photo we skip, a dead toolchain means nothing was processed
 * or checked at all. Conflating them is what let a broken deployment publish
 * unprocessed, unmoderated photos while reporting success.
 */
export class ImageToolchainUnavailableError extends Error {
  readonly code = 'image_toolchain_unavailable';
  constructor(cause: unknown) {
    super(`sharp is unavailable in this runtime: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'ImageToolchainUnavailableError';
    this.cause = cause;
  }
}

/**
 * sharp ships prebuilt native binaries and is marked external for the bundler,
 * so it is loaded on first use rather than at module scope. That keeps a missing
 * platform binary from crashing a route at import time (which would defeat the
 * auth guards that run before any of this work).
 */
type SharpFactory = (input?: Buffer | object) => Sharp;
let sharpModule: SharpFactory | null = null;
/**
 * Remembered so a broken native module costs one failed import per instance
 * rather than one per photo. A `.node` load failure never heals inside a live
 * process, so there is nothing to retry.
 */
let sharpLoadError: unknown = null;

/**
 * Shared accessor for the native module. Exported so every sharp user in the
 * app funnels through the same load-once-and-classify-failures path.
 */
export async function loadSharp(): Promise<SharpFactory> {
  if (sharpLoadError) throw new ImageToolchainUnavailableError(sharpLoadError);
  if (!sharpModule) {
    try {
      const mod = await import('sharp');
      sharpModule = (mod.default ?? mod) as unknown as SharpFactory;
    } catch (err) {
      sharpLoadError = err;
      // Logged once per instance, at the point of truth, because every caller
      // above this deliberately degrades rather than failing the request.
      console.error(
        '[images] sharp failed to load — image processing and image moderation ' +
          'CANNOT run in this deployment. Check that the libvips shared library ' +
          'is traced into the function (next.config.ts SHARP_NATIVE_LIBS).',
        err
      );
      throw new ImageToolchainUnavailableError(err);
    }
  }
  return sharpModule;
}

/**
 * Cheap liveness check for the native toolchain: encodes a 1x1 pixel. Surfaced
 * on the moderation cron's JSON response so "is sharp working in production?"
 * is one authenticated request away instead of an archaeology exercise.
 */
export async function probeImageToolchain(): Promise<{ ok: boolean; error?: string }> {
  try {
    const sharp = await loadSharp();
    await sharp({ create: { width: 1, height: 1, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .webp()
      .toBuffer();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Long-edge bound for published images. 1920 is plenty for a full-width hero. */
const MAX_EDGE = 1920;
/** WhatsApp images are already ~1600px; only resize if something is wildly big. */
const WA_RESIZE_ABOVE = 2400;
const WEBP_QUALITY = 82;
/** Below this, the logo is illegible branding covering a big share of frame. */
const MIN_WATERMARK_WIDTH = 480;
const MIN_WATERMARK_HEIGHT = 360;
/** Mark width as a share of the image width. */
const WATERMARK_WIDTH_RATIO = 0.15;
/** Legibility floor: below ~90px the wordmark stops being readable at all. */
const MIN_LOGO_WIDTH = 90;

/**
 * Two logo variants, chosen per image: the reversed (light) mark disappears on
 * a bright wall or sky, and the standard (dark teal) mark disappears at night
 * or against dark timber. We sample the corner the mark lands in and pick the
 * one that will actually be visible.
 */
const LOGO_PATHS = {
  light: 'public/brand/easy-rent-logo-reversed.png', // for dark corners
  dark: 'public/brand/easy-rent-logo.png', // for bright corners
} as const;
type LogoVariant = keyof typeof LOGO_PATHS;

/** Resized logo cache, keyed by variant+width+inset — rebuilding per image is waste. */
const logoCache = new Map<string, Buffer>();
const logoSourcePromises = new Map<LogoVariant, Promise<Buffer | null>>();

async function loadLogoSource(variant: LogoVariant): Promise<Buffer | null> {
  let promise = logoSourcePromises.get(variant);
  if (!promise) {
    promise = readFile(path.join(process.cwd(), LOGO_PATHS[variant])).catch((err) => {
      // Fail SOFT: publishing unbranded beats holding a landlord's listing.
      console.error('[images] watermark logo unavailable — publishing unbranded', err?.message);
      return null;
    });
    logoSourcePromises.set(variant, promise);
  }
  return promise;
}

/**
 * Mean luminance (0–255) of the centre region where the mark goes.
 * Returns null if it can't be sampled, in which case we keep the light mark.
 */
async function centreLuminance(input: Buffer, width: number, height: number): Promise<number | null> {
  try {
    const boxW = Math.max(1, Math.min(width, Math.round(width * 0.3)));
    const boxH = Math.max(1, Math.min(height, Math.round(height * 0.3)));
    const sharp = await loadSharp();
    const stats = await sharp(input)
      .extract({
        left: Math.max(0, Math.round((width - boxW) / 2)),
        top: Math.max(0, Math.round((height - boxH) / 2)),
        width: boxW,
        height: boxH,
      })
      .greyscale()
      .stats();
    return stats.channels[0]?.mean ?? null;
  } catch {
    return null;
  }
}

/**
 * Build the composited mark: logo resized to `targetWidth` with its alpha
 * reduced, optionally padded right/bottom by `inset`.
 *
 * The padding exists only for edge gravities — sharp positions those flush to
 * the edge and has no inset parameter, so the padding IS the margin. A centred
 * mark needs none, and passing one would shove it off-centre by inset/2.
 */
async function watermarkOverlay(
  variant: LogoVariant,
  targetWidth: number,
  inset = 0
): Promise<Buffer | null> {
  const key = `${variant}:${targetWidth}:${inset}`;
  const cached = logoCache.get(key);
  if (cached) return cached;
  const source = await loadLogoSource(variant);
  if (!source) return null;
  try {
    const sharp = await loadSharp();
    const overlayBase = sharp(source)
      .resize({ width: targetWidth })
      .ensureAlpha()
      // Scale the alpha band only (RGB multipliers stay 1) so the mark reads as
      // a watermark rather than a sticker.
      .linear([1, 1, 1, 0.55], [0, 0, 0, 0]);
    const padded = inset
      ? overlayBase.extend({
          right: inset,
          bottom: inset,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
      : overlayBase;
    const overlay = await padded.png().toBuffer();
    logoCache.set(key, overlay);
    return overlay;
  } catch (err) {
    console.error('[images] failed to build watermark overlay', err);
    return null;
  }
}

export interface ProcessOptions {
  /** WhatsApp-sourced: skip re-compression (Meta already did it) but still watermark. */
  whatsappSourced?: boolean;
  watermark?: boolean;
  compress?: boolean;
}

/**
 * Produce the publishable derivative of an original image.
 * Always re-encodes to WebP so the output is predictable, and always drops
 * metadata — a publicly served rental photo carrying the owner's GPS EXIF is a
 * privacy leak, not a feature.
 */
export async function processListingImage(
  input: Buffer,
  opts: ProcessOptions = {}
): Promise<ProcessedImage> {
  const { whatsappSourced = false, watermark = true, compress = true } = opts;

  const sharp = await loadSharp();
  const meta = await sharp(input).metadata();
  // EXIF orientations 5–8 are transposed, and .rotate() bakes that in — so the
  // post-rotation dimensions are swapped relative to metadata.
  const transposed = (meta.orientation ?? 1) >= 5;
  const srcWidth = (transposed ? meta.height : meta.width) ?? 0;
  const srcHeight = (transposed ? meta.width : meta.height) ?? 0;

  const skipCompression = whatsappSourced || !compress;
  const quality = skipCompression ? 92 : WEBP_QUALITY;
  const resizeBound = skipCompression ? WA_RESIZE_ABOVE : MAX_EDGE;

  // Predict the output size so the watermark can be sized without an extra
  // encode. Resize + composite + encode then happen in ONE pass — encoding
  // twice would put a second lossy generation on every watermarked photo.
  const scale = Math.min(1, resizeBound / Math.max(srcWidth || 1, srcHeight || 1));
  const projectedWidth = Math.round(srcWidth * scale);
  const projectedHeight = Math.round(srcHeight * scale);

  // .rotate() with no argument bakes in the EXIF orientation; sharp then drops
  // all metadata by default (we never call withMetadata()), which also removes
  // any GPS block — a privacy leak in a publicly served photo.
  let pipeline = sharp(input).rotate();

  if (srcWidth > resizeBound || srcHeight > resizeBound) {
    pipeline = pipeline.resize({
      width: resizeBound,
      height: resizeBound,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  let watermarked = false;
  const bigEnough =
    projectedWidth >= MIN_WATERMARK_WIDTH && projectedHeight >= MIN_WATERMARK_HEIGHT;
  if (watermark && bigEnough) {
    // A flat share of the width, with only a legibility floor under it: the
    // mark sits in the middle of the frame now, so it must scale with the photo
    // rather than being capped into insignificance on a large one.
    const logoWidth = Math.max(
      MIN_LOGO_WIDTH,
      Math.round(projectedWidth * WATERMARK_WIDTH_RATIO)
    );
    // Sample the source centre (cheap: no full decode of the resized output).
    // Uses PRE-rotation dimensions so extract() can't go out of bounds on an
    // EXIF-transposed image; for those the sampled box is approximate, which is
    // fine for a light/dark heuristic.
    const luminance = await centreLuminance(input, meta.width ?? 0, meta.height ?? 0);
    const variant: LogoVariant = luminance !== null && luminance > 140 ? 'dark' : 'light';
    // No inset: 'centre' gravity centres the overlay, and edge padding would
    // only drag it off-centre.
    const overlay = await watermarkOverlay(variant, logoWidth);
    if (overlay) {
      pipeline = pipeline.composite([{ input: overlay, gravity: 'centre', blend: 'over' }]);
      watermarked = true;
    }
  }

  const { data, info } = await pipeline
    .webp({ quality, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    contentType: 'image/webp',
    width: info.width,
    height: info.height,
    bytes: data.length,
    compressionSkipped: skipCompression,
    watermarked,
  };
}

/** Test/ops helper: clear memoized logo state (used after changing the asset). */
export function resetWatermarkCache(): void {
  logoCache.clear();
  logoSourcePromises.clear();
}
