import 'server-only';
import { after } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { listingImpressions } from '@/lib/db/schema';
import { isFeatureEnabled } from '@/lib/feature-flags';

/**
 * Search impressions — how many times a listing was actually SERVED on a
 * results page.
 *
 * THE HARD CONSTRAINT: never a row per listing per search. Twenty results on
 * the most-hit query in the product would be twenty inserts on the critical
 * path of a `max: 1` connection pool behind Supabase's transaction pooler. So
 * counts are accumulated in a plain in-process Map — a synchronous map write,
 * no await, nothing added to the response time of a search — and flushed
 * occasionally as ONE multi-row upsert.
 *
 * Nor is this logged from the client: a beacon on every search result is
 * ad-blocker-shaped, so it would under-count exactly the listings whose owners
 * are being charged for visibility.
 *
 * THE BUFFER IS PER-INSTANCE AND IN MEMORY, like lib/rate-limit.ts. Counts
 * accumulated since the last flush are lost when an instance is recycled. That
 * is acceptable for a trend metric and is why the flush is triggered from the
 * SAME instance that holds the buffer (a cron request would land on an
 * arbitrary instance and find an empty map). It is a floor, never an
 * over-count, and it must not be described to landlords as an exact figure.
 */

/** key: `${listingId}|${yyyy-mm-dd}` */
const buffer = new Map<string, number>();
let oldestEntryAt = 0;

/** Flush once the batch is worth a round trip… */
const FLUSH_ROWS = 250;
/** …or once the oldest count has been sitting in memory long enough to lose. */
const FLUSH_AGE_MS = 60_000;

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Count one impression per listing id. Synchronous and allocation-light: this
 * runs on every results page render.
 */
export function recordImpressions(listingIds: number[], now: Date = new Date()): void {
  if (!isFeatureEnabled('trackSearchImpressions')) return;
  if (listingIds.length === 0) return;

  const day = dayKey(now);
  if (buffer.size === 0) oldestEntryAt = now.getTime();

  for (const listingId of listingIds) {
    const key = `${listingId}|${day}`;
    buffer.set(key, (buffer.get(key) ?? 0) + 1);
  }
}

export function shouldFlushImpressions(now: Date = new Date()): boolean {
  if (buffer.size === 0) return false;
  return buffer.size >= FLUSH_ROWS || now.getTime() - oldestEntryAt >= FLUSH_AGE_MS;
}

/** Test/observability hook — how many (listing, day) pairs are unwritten. */
export function bufferedImpressionRows(): number {
  return buffer.size;
}

/**
 * Write the buffer as ONE upsert and clear it.
 *
 * Drains first so a concurrent request keeps counting into a fresh buffer
 * rather than blocking, and puts the drained counts BACK on failure — losing
 * them to a transient database error would be a silent, permanent undercount,
 * and merging is safe because the upsert adds rather than replaces.
 */
export async function flushImpressions(): Promise<{ rows: number; impressions: number }> {
  if (buffer.size === 0) return { rows: 0, impressions: 0 };

  const drained = [...buffer.entries()];
  buffer.clear();
  oldestEntryAt = 0;

  const values = drained.map(([key, count]) => {
    const [listingId, day] = key.split('|');
    return { listingId: Number(listingId), day, count };
  });

  try {
    await db
      .insert(listingImpressions)
      .values(values)
      .onConflictDoUpdate({
        target: [listingImpressions.listingId, listingImpressions.day],
        // ADD, never replace: two instances flushing the same day must sum.
        set: { count: sql`${listingImpressions.count} + excluded.count` },
      });
  } catch (error) {
    console.error('[impressions] flush failed, counts returned to the buffer:', error);
    for (const [key, count] of drained) {
      buffer.set(key, (buffer.get(key) ?? 0) + count);
    }
    if (oldestEntryAt === 0) oldestEntryAt = Date.now();
    return { rows: 0, impressions: 0 };
  }

  return {
    rows: values.length,
    impressions: values.reduce((sum, v) => sum + v.count, 0),
  };
}

/**
 * The one call a results page makes: count what it served, and if the buffer is
 * due, drain it AFTER the response has gone out.
 *
 * `after()` is what keeps the flush off the critical path while still running
 * it on the instance that holds the buffer — a cron would land on an arbitrary
 * instance and find an empty map, and a bare detached promise can be killed
 * when the serverless invocation ends.
 */
export function trackImpressions(listingIds: number[]): void {
  recordImpressions(listingIds);
  if (!shouldFlushImpressions()) return;

  try {
    after(async () => {
      await flushImpressions();
    });
  } catch {
    // `after` throws outside a request scope (a script, a test run). Losing the
    // batch would be worse than a detached promise, so fall back to one.
    void flushImpressions().catch(() => {});
  }
}
