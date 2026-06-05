import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from './db/drizzle';
import { featureFlags as featureFlagsTable } from './db/schema';
import {
  featureFlagDefaults,
  applyFeatureFlagOverrides,
  getResolvedFeatureFlags,
  type FeatureFlag,
  type FeatureFlags,
  type FeatureFlagValue,
} from './feature-flags';

/**
 * Loads feature flag overrides from the DB and merges them onto the code
 * defaults. The resolved snapshot is held in `lib/feature-flags.ts` and read
 * synchronously by `isFeatureEnabled`/`getFeatureValue`.
 *
 * The cache is in-memory and per-instance (same trade-off as lib/rate-limit.ts):
 * a flag change in the back office is visible to other instances within
 * `CACHE_TTL_MS`. Call `loadFeatureFlags()` early in a request (the root layout
 * does this) so server-rendered pages see fresh values.
 */

const CACHE_TTL_MS = 30_000;
let cacheExpiresAt = 0;
let inflight: Promise<void> | null = null;

function coerce(flag: FeatureFlag, raw: string): FeatureFlagValue {
  const def = featureFlagDefaults[flag];
  if (typeof def === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : def;
  }
  return raw === 'true';
}

function serialize(value: FeatureFlagValue): string {
  return String(value);
}

function isKnownFlag(key: string): key is FeatureFlag {
  return Object.prototype.hasOwnProperty.call(featureFlagDefaults, key);
}

async function refresh(): Promise<void> {
  try {
    const rows = await db.select().from(featureFlagsTable);
    const overrides: Partial<Record<FeatureFlag, FeatureFlagValue>> = {};
    for (const row of rows) {
      if (isKnownFlag(row.key)) {
        overrides[row.key] = coerce(row.key, row.value);
      }
    }
    applyFeatureFlagOverrides(overrides);
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  } catch (error) {
    // Keep the current snapshot (defaults or last-known) and retry soon.
    console.error('Failed to load feature flags from DB:', error);
    cacheExpiresAt = Date.now() + 5_000;
  }
}

/** Ensure the resolved snapshot reflects the DB, refreshing if the cache expired. */
export async function loadFeatureFlags(force = false): Promise<FeatureFlags> {
  // Never touch the DB during `next build` static generation: the table may not
  // exist yet and the connection can hang, stalling the build. Static pages bake
  // in the code defaults; dynamic pages reload flags at request time.
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return getResolvedFeatureFlags();
  }
  if (!force && Date.now() < cacheExpiresAt) {
    return getResolvedFeatureFlags();
  }
  if (!inflight) {
    inflight = refresh().finally(() => {
      inflight = null;
    });
  }
  await inflight;
  return getResolvedFeatureFlags();
}

/** Upsert a single flag override and immediately refresh the local snapshot. */
export async function setFeatureFlag(
  flag: FeatureFlag,
  value: FeatureFlagValue,
  userId?: number
): Promise<void> {
  const stored = serialize(value);
  await db
    .insert(featureFlagsTable)
    .values({ key: flag, value: stored, updatedBy: userId ?? null, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: featureFlagsTable.key,
      set: { value: stored, updatedBy: userId ?? null, updatedAt: new Date() },
    });
  await loadFeatureFlags(true);
}

/** Remove an override so the flag falls back to its code default. */
export async function clearFeatureFlag(flag: FeatureFlag): Promise<void> {
  await db.delete(featureFlagsTable).where(eq(featureFlagsTable.key, flag));
  await loadFeatureFlags(true);
}
