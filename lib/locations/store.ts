/**
 * Loads the `locations` catalogue into the gazetteer's in-process index.
 *
 * Deliberately the same shape as lib/feature-flags-store.ts: the DB is the
 * source of truth, a per-instance snapshot is refreshed on a TTL, and the
 * consumers (matchCity, isCityName, fuzzyCityName) stay SYNCHRONOUS. That
 * matters more here than for flags — the rule parser is pure and unit-tested
 * with no database, and making it async to look up a town would end that.
 *
 * Callers `await loadLocations()` once at the entry point (the intake webhook,
 * the processing cron, the listings API) exactly as they already
 * `await loadFeatureFlags()`.
 */
import { asc, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { locations } from '@/lib/db/schema';
import { setExtendedLocations, extendedLocationCount } from '@/lib/intake/parser/gazetteer';

/** Long: the catalogue changes when someone edits a table, not per request. */
const TTL_MS = 30 * 60 * 1000;

let loadedAt = 0;
let inFlight: Promise<void> | null = null;

/**
 * Populate the snapshot. Cheap after the first call in an instance's life, and
 * safe to call on every request.
 *
 * A failure leaves whatever is already loaded in place and returns quietly: the
 * gazetteer's built-in 173 towns still work, so a database blip degrades town
 * matching rather than failing an intake outright.
 */
export async function loadLocations(force = false): Promise<void> {
  if (!force && extendedLocationCount() > 0 && Date.now() - loadedAt < TTL_MS) return;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      // Only the two columns matching needs. The full table carries coordinates
      // and population as well, and pulling those into every serverless
      // instance would multiply the payload for data the matcher never reads.
      // 1,610 names occur in more than one district, and a matcher can only
      // return one. Curated first (their spellings are what listings already
      // store), then the most populous — if someone writes "Maharagama" they
      // mean the town of 195k, not a hamlet that happens to share the name.
      const rows = await db
        .select({ name: locations.name, district: locations.district })
        .from(locations)
        .orderBy(
          sql`CASE WHEN ${locations.source} = 'curated' THEN 0 ELSE 1 END`,
          sql`${locations.population} DESC NULLS LAST`,
          asc(locations.id)
        );
      setExtendedLocations(rows);
      loadedAt = Date.now();
    } catch (err) {
      console.error('[locations] snapshot load failed — falling back to built-ins', err);
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export interface LocationSuggestion {
  name: string;
  district: string;
  population: number | null;
}

/**
 * Type-ahead for the listing form. Queried live rather than served from the
 * snapshot: 16k names is far too much to ship to a browser, and the ordering
 * below is what makes a picker usable — a prefix hit beats a mid-word one, then
 * the bigger place wins, so "kotta" offers Kottawa before a hamlet.
 */
export async function searchLocations(query: string, limit = 10): Promise<LocationSuggestion[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const like = `%${q}%`;
  const prefix = `${q}%`;
  return db
    .select({
      name: locations.name,
      district: locations.district,
      population: locations.population,
    })
    .from(locations)
    .where(sql`${locations.nameLower} LIKE ${like}`)
    .orderBy(
      sql`CASE WHEN ${locations.nameLower} LIKE ${prefix} THEN 0 ELSE 1 END`,
      // Curated towns outrank the bulk import even when the import knows a
      // population and they do not. They are the places people actually rent
      // in, and without this "kot" answers with hamlets while Kottawa — the
      // Colombo suburb the searcher meant — falls off the end of the list.
      sql`CASE WHEN ${locations.source} = 'curated' THEN 0 ELSE 1 END`,
      sql`${locations.population} DESC NULLS LAST`,
      asc(locations.nameLower)
    )
    .limit(Math.min(limit, 25));
}
