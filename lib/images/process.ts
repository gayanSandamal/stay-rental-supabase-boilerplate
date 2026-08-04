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
 * sharp ships prebuilt native binaries and is marked external for the bundler,
 * so it is loaded on first use rather than at module scope. That keeps a missing
 * platform binary from crashing a route at import time (which would defeat the
 * auth guards that run before any of this work).
 */
type SharpFactory = (input?: Buffer | object) => Sharp;
let sharpModule: SharpFactory | null = null;
async function getSharp(): Promise<SharpFactory> {
  if (!sharpModule) {
    const mod = await import('sharp');
    sharpModule = (mod.default ?? mod) as unknown as SharpFactory;
  }
  return sharpModule;
}

/** Long-edge bound for published images. 1920 is plenty for a full-width hero. */
const MAX_EDGE = 1920;
/** WhatsApp images are already ~1600px; only resize if something is wildly big. */
const WA_RESIZE_ABOVE = 2400;
const WEBP_QUALITY = 82;
/** Below this, an 18% logo is illegible branding covering a big share of frame. */
const MIN_WATERMARK_WIDTH = 480;
const MIN_WATERMARK_HEIGHT = 360;

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
 * Mean luminance (0–255) of the bottom-right region where the mark goes.
 * Returns null if it can't be sampled, in which case we keep the light mark.
 */
async function cornerLuminance(input: Buffer, width: number, height: number): Promise<number | null> {
  try {
    const boxW = Math.max(1, Math.min(width, Math.round(width * 0.3)));
    const boxH = Math.max(1, Math.min(height, Math.round(height * 0.25)));
    const sharp = await getSharp();
    const stats = await sharp(input)
      .extract({ left: width - boxW, top: height - boxH, width: boxW, height: boxH })
      .greyscale()
      .stats();
    return stats.channels[0]?.mean ?? null;
  } catch {
    return null;
  }
}

/**
 * Build the composited mark: logo resized to `targetWidth`, alpha reduced, and
 * padded right/bottom by `inset`. The padding IS the margin — sharp's
 * `gravity` positions flush to the edge and has no inset parameter.
 */
async function watermarkOverlay(
  variant: LogoVariant,
  targetWidth: number,
  inset: number
): Promise<Buffer | null> {
  const key = `${variant}:${targetWidth}:${inset}`;
  const cached = logoCache.get(key);
  if (cached) return cached;
  const source = await loadLogoSource(variant);
  if (!source) return null;
  try {
    const sharp = await getSharp();
    const overlay = await sharp(source)
      .resize({ width: targetWidth })
      .ensureAlpha()
      // Scale the alpha band only (RGB multipliers stay 1) so the mark reads as
      // a watermark rather than a sticker.
      .linear([1, 1, 1, 0.55], [0, 0, 0, 0])
      .extend({
        right: inset,
        bottom: inset,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
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

  const sharp = await getSharp();
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
    const logoWidth = Math.min(320, Math.max(90, Math.round(projectedWidth * 0.18)));
    const inset = projectedWidth < 900 ? 12 : 24;
    // Sample the source corner (cheap: no full decode of the resized output).
    // Uses PRE-rotation dimensions so extract() can't go out of bounds on an
    // EXIF-transposed image; for those the sampled corner is approximate, which
    // is fine for a light/dark heuristic.
    const luminance = await cornerLuminance(input, meta.width ?? 0, meta.height ?? 0);
    const variant: LogoVariant = luminance !== null && luminance > 140 ? 'dark' : 'light';
    const overlay = await watermarkOverlay(variant, logoWidth, inset);
    if (overlay) {
      pipeline = pipeline.composite([{ input: overlay, gravity: 'southeast', blend: 'over' }]);
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
