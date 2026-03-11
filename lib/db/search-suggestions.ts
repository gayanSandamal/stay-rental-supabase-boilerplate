import { sql } from 'drizzle-orm';
import { db } from './drizzle';

export type SuggestionItem =
  | { kind: 'city'; value: string; listingCount: number }
  | { kind: 'district'; value: string; listingCount: number }
  | { kind: 'listing'; value: string; listingId: number };

/**
 * Get search suggestions from:
 * 1. Materialized view (locations - city, district) - fast, small dataset
 * 2. FTS on listings (titles) - uses GIN index
 */
export async function getSearchSuggestions(
  q: string,
  limit = 8
): Promise<SuggestionItem[]> {
  const trimmed = q.trim();
  if (trimmed.length < 2) return [];

  const pattern = `%${trimmed}%`;
  const results: SuggestionItem[] = [];

  // 1. Locations from materialized view (ILIKE - small table, fast)
  const locations = await db.execute<{
    kind: string;
    value: string;
    listing_count: number;
  }>(
    sql`
      SELECT kind, value, listing_count
      FROM search_location_suggestions
      WHERE value ILIKE ${pattern}
      ORDER BY listing_count DESC
      LIMIT 5
    `
  );

  for (const row of Array.isArray(locations) ? locations : []) {
    results.push({
      kind: row.kind as 'city' | 'district',
      value: row.value,
      listingCount: row.listing_count,
    });
  }

  // 2. Listing titles via FTS (prefix matching)
  const tokens = trimmed
    .split(/\s+/)
    .map((t) => t.replace(/\W/g, ''))
    .filter(Boolean);
  if (tokens.length > 0) {
    const tsQuery = tokens.map((t) => `${t}:*`).join(' & ');
    const listingRows = await db.execute<{ id: number; title: string }>(
      sql`
        SELECT id, title
        FROM listings
        WHERE status = 'active'
          AND (expires_at IS NULL OR expires_at >= NOW())
          AND search_vector @@ to_tsquery('simple', ${tsQuery})
        ORDER BY ts_rank(search_vector, to_tsquery('simple', ${tsQuery})) DESC
        LIMIT 5
      `
    );

    for (const row of Array.isArray(listingRows) ? listingRows : []) {
      results.push({
        kind: 'listing',
        value: row.title,
        listingId: row.id,
      });
    }
  }

  // Dedupe by value, keep order, cap at limit
  const seen = new Set<string>();
  return results
    .filter((r) => {
      const key = `${r.kind}:${r.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

/**
 * Refresh the materialized view. Run periodically (e.g. cron every 15 min)
 * or after bulk listing changes.
 */
export async function refreshSearchLocationSuggestions(): Promise<void> {
  await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY search_location_suggestions`);
}
