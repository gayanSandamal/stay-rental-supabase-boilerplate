-- 0034 — moderation coverage
--
-- Three independent, idempotent steps. No $$ blocks: the runner's
-- splitStatements() is line-based (see 0031) and would mis-split them.

-- 1. Flag rename: moderationMaxImagesPerListing -> maxPhotosPerListing.
--    isKnownFlag() in lib/feature-flags-store.ts silently DROPS unknown keys, so
--    without this an existing override would vanish rather than carry over.
--    A no-op in production today (only enableImageProcessing,
--    enableListingModeration and enableWhatsAppLandlordAccounts have rows).
INSERT INTO feature_flags (key, value, updated_at)
SELECT 'maxPhotosPerListing', value, now()
FROM feature_flags
WHERE key = 'moderationMaxImagesPerListing'
ON CONFLICT (key) DO NOTHING;

DELETE FROM feature_flags WHERE key = 'moderationMaxImagesPerListing';

-- 2. The "never checked" ops query. Partial index because 'skipped' should be a
--    shrinking minority — if this index ever gets big, something is wrong.
--    Mirrors listings_moderation_queue_idx from 0032 (leading status column),
--    and matches an equivalent index already present in production, so this is
--    a no-op there and only does work on a fresh database.
CREATE INDEX IF NOT EXISTS listings_moderation_uncovered_idx
  ON listings (moderation_status, created_at DESC)
  WHERE moderation_status = 'skipped';

-- 3. Backfill a manifest for rows that have photos but NO manifest at all.
--    p = o on purpose: these URLs are already public, and claiming otherwise is
--    what let a re-check unpublish them (see lib/images/manifest.ts).
--    v = 'queued' so the sweeper judges them; it will not retract them because
--    they carry a `p`.
--
--    The regex guard proves `photos` is a JSON array of OUR storage URLs before
--    the ::jsonb cast, so a malformed value cannot throw and nothing
--    third-party is adopted as processable. AS MATERIALIZED forces the filter
--    to run before the cast rather than being inlined after it.
--
--    Rows whose manifest merely UNDER-covers `photos` (the harder, listing-#7
--    case) are deliberately NOT touched here — safe merging needs the app's own
--    isOwnedUrl/`p`-vs-`o` matching. Use `pnpm moderation:backfill` for those.
--    The regex requires EVERY element to be one of our own storage URLs, so a
--    listing mixing in unsplash seed images is left for the script rather than
--    half-adopted here.
WITH candidates AS MATERIALIZED (
  SELECT id, photos
  FROM listings
  WHERE photos_manifest IS NULL
    AND photos IS NOT NULL
    AND photos ~ ('^\[\s*"[^"]*/storage/v1/object/public/property-images/[^"]*"'
                  || '(\s*,\s*"[^"]*/storage/v1/object/public/property-images/[^"]*")*\s*\]$')
)
UPDATE listings AS l
SET photos_manifest = (
  SELECT jsonb_agg(
           jsonb_build_object('o', u.url, 'p', u.url, 'h', NULL, 'v', 'queued')
           ORDER BY u.ord
         )::text
  FROM jsonb_array_elements_text(c.photos::jsonb) WITH ORDINALITY AS u(url, ord)
)
FROM candidates c
WHERE l.id = c.id
  AND c.photos::jsonb <> '[]'::jsonb;
