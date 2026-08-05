-- Moderation coverage: make unchecked listings findable, and give every
-- already-published photo a manifest entry.
--
-- Background: `moderation_status` defaults to 'skipped' and the sweeper only
-- claims 'queued', so listings created by the WhatsApp intake or POST
-- /api/listings were never checked at all. Meanwhile `persist()` rewrites
-- `photos` from the manifest, so a manifest that under-covers the gallery would
-- unpublish photos nobody evaluated. Both are fixed in code; this migration
-- repairs the rows that already exist.
--
-- NOTE: no statement here writes `listings.photos`. Photo loss is impossible by
-- construction, not by care.

-- 1. Flag rename. Overrides live as rows in feature_flags and isKnownFlag()
--    silently drops unrecognised keys, so an ops-set value would vanish without
--    this. A no-op when the old flag was never overridden.
INSERT INTO feature_flags (key, value)
SELECT 'maxPhotosPerListing', value FROM feature_flags WHERE key = 'moderationMaxImagesPerListing'
ON CONFLICT (key) DO NOTHING;

DELETE FROM feature_flags WHERE key = 'moderationMaxImagesPerListing';

-- 2. Backs the new "Never checked" section in Back Office → Moderation. The
--    existing queue index covers only ('queued','running').
CREATE INDEX IF NOT EXISTS listings_moderation_uncovered_idx
  ON listings (moderation_status, created_at DESC)
  WHERE moderation_status = 'skipped';

-- 3. Give listings that have photos but NO manifest one, and queue them.
--    Entries are written with p = o: these URLs are already public, so they
--    stay public, and the checks run against them afterwards.
--
--    The regex guard proves `photos` is a JSON array of OUR OWN storage objects
--    before the ::jsonb cast, so the cast cannot throw and nothing third-party
--    (unsplash seeds, data: URLs) is adopted as processable. AS MATERIALIZED
--    forces the filter to run before the cast rather than trusting planner
--    evaluation order. Idempotent: a second run matches nothing.
WITH candidates AS MATERIALIZED (
  SELECT id, photos FROM listings
  WHERE photos_manifest IS NULL
    AND photos IS NOT NULL
    AND photos ~ '^\[("[^"]*/storage/v1/object/public/property-images/[^"]*"(,\s*)?)+\]$'
)
UPDATE listings l SET
  photos_manifest = (
    SELECT jsonb_agg(
      jsonb_build_object(
        'o', u, 'p', u, 'h', NULL, 'v', 'queued',
        'wa', position('/whatsapp-intake/' in u) > 0
      ) ORDER BY ord
    )::text
    FROM jsonb_array_elements_text(c.photos::jsonb) WITH ORDINALITY AS t(u, ord)
  ),
  moderation_status = 'queued',
  moderation_attempts = 0
FROM candidates c
WHERE l.id = c.id;

-- 4. The MERGE case — a non-empty manifest that under-covers `photos` (live
--    listing #7: 8 photos, 1 entry) — is deliberately NOT attempted here.
--    Safely merging needs the same isOwnedUrl and p-vs-o matching the app uses,
--    so it lives in scripts/backfill-photo-manifests.ts, which dry-runs by
--    default and refuses to write unless the derived photo list is byte-equal
--    to the current one.
