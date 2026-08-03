/**
 * Photo manifest types. Dependency-free so they can be unit-tested and shared
 * between the image pipeline and the moderation engine.
 *
 * WHY A MANIFEST: `listings.photos` is a JSON array of public URLs that five
 * separate readers already parse (listing card, public detail, dashboard
 * detail, edit form, lib/seo.ts). Changing its shape would touch all of them,
 * so it stays exactly as-is — the array of PUBLIC (compressed + watermarked)
 * URLs — and `listings.photos_manifest` becomes the source of truth carrying
 * originals, content hashes and per-image verdicts.
 */

/** Per-image verdict state. Keys are short because this is stored as JSON text. */
export type PhotoVerdict =
  /** awaiting moderation — original stored, nothing published */
  | 'queued'
  /** passed moderation and has a derived public URL */
  | 'pass'
  /** failed moderation; never published */
  | 'reject'
  /** could not be processed (too large, unreadable) — left alone */
  | 'skipped'
  /** not ours (unsplash seed data, data: URL): published as-is, never processed */
  | 'external';

export interface PhotoManifestEntry {
  /** Original URL as received (web upload or WhatsApp). Never published. */
  o: string;
  /** Derived public URL (compressed + watermarked). null until it passes. */
  p: string | null;
  /** sha256 of the original bytes — the image_moderation_cache key. */
  h: string | null;
  v: PhotoVerdict;
  /** Landlord-facing rejection reason. */
  r?: string;
  /** 'cosmetic' (drop the photo) vs 'safety' (hold the whole listing). */
  sev?: 'cosmetic' | 'safety';
  /** Came from WhatsApp → Meta already compressed it, so skip re-compression. */
  wa?: boolean;
  /** Prompt version that produced the verdict, so a bump re-checks. */
  pv?: number;
}

export interface ProcessedImage {
  buffer: Buffer;
  contentType: string;
  width: number;
  height: number;
  bytes: number;
  /** True when compression was skipped (WhatsApp-sourced). */
  compressionSkipped: boolean;
  /** False when the image was too small to brand. */
  watermarked: boolean;
}
