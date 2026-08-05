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
 *
 * Owned URLs keep `p = o`: they came OUT of `photos`, so they are already
 * public. Claiming otherwise (p = null) is what once let a moderation run
 * unpublish photos it had never evaluated.
 */
export function manifestFromLegacyPhotos(photos: string[]): PhotoManifestEntry[] {
  return photos.map((url) =>
    isOwnedUrl(url)
      ? { o: url, p: url, h: null, v: 'queued' as const, wa: isWhatsAppUrl(url) }
      : { o: url, p: url, h: null, v: 'external' as const }
  );
}

/**
 * The public `photos` array: everything currently publishable, in manifest
 * order. `p` decides publication; `v` only vetoes. That split is what lets a
 * grandfathered photo (queued, p set) stay visible while a newly arrived one
 * (queued, p null) stays hidden until it passes.
 */
export function derivePhotos(entries: PhotoManifestEntry[]): string[] {
  return entries.filter((e) => e.p && e.v !== 'reject').map((e) => e.p as string);
}

/**
 * Adopt any URL that is live in `photos` but missing from the manifest.
 *
 * The manifest can lag the gallery — a writer that predates it, or one that
 * appends photos directly. Since `photos` is only ever rewritten as
 * `derivePhotos(manifest)`, an unadopted URL would be silently unpublished.
 * Adopted entries are `queued` with `p = o`: still visible, but now scheduled
 * for a check.
 *
 * Matching on `p` AND `o` matters: a passed entry's live URL is its derived
 * `p`, not its original, so matching on `o` alone would adopt a duplicate.
 */
export function adoptOrphanPhotos(
  existing: PhotoManifestEntry[],
  photos: string[]
): { entries: PhotoManifestEntry[]; adopted: number } {
  const known = new Set<string>();
  for (const e of existing) {
    known.add(e.o);
    if (e.p) known.add(e.p);
  }
  const orphans = photos.filter((u) => !known.has(u));
  if (!orphans.length) return { entries: existing, adopted: 0 };
  return {
    entries: [...existing, ...manifestFromLegacyPhotos(orphans)],
    adopted: orphans.length,
  };
}

/**
 * Merge a moderation run's in-memory manifest back onto the row as it stands
 * NOW (re-read under the row lock), rather than blind-writing the copy the run
 * started from.
 *
 * The run may have taken seconds; a concurrent WhatsApp album or a landlord
 * edit can have changed the set meanwhile. Authority is split: the fresh row
 * owns membership and order, the run owns verdicts for the URLs it actually
 * evaluated. Entries the run invented but the fresh row no longer has are NOT
 * resurrected — a concurrent deletion has to stick.
 *
 * `unevaluatedQueued` tells the caller a photo arrived mid-run, so the listing
 * must be re-queued rather than marked done.
 */
export function mergeRunIntoFresh(
  fresh: PhotoManifestEntry[],
  run: PhotoManifestEntry[],
  evaluated: Set<string>,
  freshPhotos: string[]
): { entries: PhotoManifestEntry[]; adopted: number; unevaluatedQueued: number } {
  const runByOriginal = new Map(run.map((e) => [e.o, e]));
  const merged = fresh.map((e) => (evaluated.has(e.o) ? (runByOriginal.get(e.o) ?? e) : e));
  const { entries, adopted } = adoptOrphanPhotos(merged, freshPhotos);
  return {
    entries,
    adopted,
    unevaluatedQueued: entries.filter((e) => e.v === 'queued' && !evaluated.has(e.o)).length,
  };
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
