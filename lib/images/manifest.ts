/**
 * Photo manifest read/write/diff. Pure — no DB, no storage, no sharp — so the
 * whole thing is unit-testable.
 */

import type { PhotoManifestEntry } from './types';

/** Hosts we own and may therefore process. Anything else is left untouched. */
function isOwnedUrl(url: string): boolean {
  if (!url.startsWith('http')) return false; // data: URLs and junk
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  try {
    const host = new URL(url).host;
    if (supabaseUrl) return host === new URL(supabaseUrl).host;
    // No env (unit tests): treat any *.supabase.* host as ours.
    return /\.supabase\.(co|in|net)$/.test(host) || host.startsWith('127.0.0.1');
  } catch {
    return false;
  }
}

/** WhatsApp-sourced originals live under this storage prefix (media.ts). */
export function isWhatsAppUrl(url: string): boolean {
  return url.includes('/whatsapp-intake/');
}

export function parseManifest(raw: string | null | undefined): PhotoManifestEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is PhotoManifestEntry => Boolean(e) && typeof e === 'object' && typeof e.o === 'string'
    );
  } catch {
    return [];
  }
}

export function serializeManifest(entries: PhotoManifestEntry[]): string | null {
  return entries.length ? JSON.stringify(entries) : null;
}

/** Legacy `photos` array → JSON parse, tolerating the text column's shapes. */
export function parsePhotos(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((u): u is string => typeof u === 'string');
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Build a manifest for a listing that has never been through the pipeline:
 * today's `photos` URLs become originals. URLs we don't own (unsplash seeds,
 * base64 data URLs from the uploader's offline fallback) are marked `external`
 * and keep their public URL — we never re-host or watermark someone else's asset.
 */
export function manifestFromLegacyPhotos(photos: string[]): PhotoManifestEntry[] {
  return photos.map((url) =>
    isOwnedUrl(url)
      ? { o: url, p: null, h: null, v: 'queued' as const, wa: isWhatsAppUrl(url) }
      : { o: url, p: url, h: null, v: 'external' as const }
  );
}

/** The public `photos` array: everything currently publishable, in manifest order. */
export function derivePhotos(entries: PhotoManifestEntry[]): string[] {
  return entries
    .filter((e) => (e.v === 'pass' || e.v === 'external') && e.p)
    .map((e) => e.p as string);
}

/**
 * Reconcile a submitted `photos` array (from the edit form) against the
 * manifest.
 *
 * Matching a submitted URL against an existing entry's derived OR original URL
 * is what makes unchanged photos free: they resolve to an entry that already
 * has a verdict and are never re-downloaded, re-hashed, re-checked or
 * re-processed. Anything unrecognised is a newly added photo and gets queued.
 * Entries the landlord dropped from the array are removed.
 */
export function reconcileManifest(
  existing: PhotoManifestEntry[],
  submittedUrls: string[]
): { entries: PhotoManifestEntry[]; added: number; removed: number } {
  const byUrl = new Map<string, PhotoManifestEntry>();
  for (const e of existing) {
    if (e.p) byUrl.set(e.p, e);
    byUrl.set(e.o, e);
  }

  const kept = new Set<PhotoManifestEntry>();
  const entries: PhotoManifestEntry[] = [];
  let added = 0;

  for (const url of submittedUrls) {
    const match = byUrl.get(url);
    if (match) {
      if (!kept.has(match)) {
        kept.add(match);
        entries.push(match);
      }
      continue;
    }
    entries.push(
      isOwnedUrl(url)
        ? { o: url, p: null, h: null, v: 'queued', wa: isWhatsAppUrl(url) }
        : { o: url, p: url, h: null, v: 'external' }
    );
    added++;
  }

  // Rejected entries are retained (not resubmitted by the form, since they were
  // never published) so their reasons stay visible to ops and the landlord.
  for (const e of existing) {
    if (!kept.has(e) && e.v === 'reject') entries.push(e);
  }

  const removed = existing.filter((e) => !kept.has(e) && e.v !== 'reject').length;
  return { entries, added, removed };
}

/** Append newly received originals (e.g. WhatsApp photos) as queued entries. */
export function appendQueued(
  existing: PhotoManifestEntry[],
  urls: string[],
  opts: { wa?: boolean } = {}
): PhotoManifestEntry[] {
  const known = new Set(existing.map((e) => e.o));
  const additions = urls
    .filter((u) => !known.has(u))
    .map((u) => ({
      o: u,
      p: null,
      h: null,
      v: 'queued' as const,
      wa: opts.wa ?? isWhatsAppUrl(u),
    }));
  return [...existing, ...additions];
}

/** Entries still needing a moderation decision. */
export function pendingEntries(entries: PhotoManifestEntry[]): PhotoManifestEntry[] {
  return entries.filter((e) => e.v === 'queued');
}
