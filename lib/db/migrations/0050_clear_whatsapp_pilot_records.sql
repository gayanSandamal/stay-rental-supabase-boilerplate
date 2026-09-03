-- One-time cleanup of the WhatsApp intake pilot's records, before real launch.
--
-- Clears the three back-office surfaces that were full of test data: WhatsApp
-- intakes, moderation, and social posts — plus the 9 archived listings the
-- pilot created and the audit rows describing them.
--
-- WHY THIS IS SAFE TO REPLAY, WHICH IS THE ONLY THING THAT MATTERS HERE.
--
-- run-all-migrations.ts replays EVERY numbered file on every invocation; there
-- is no applied-migrations ledger. CLAUDE.md therefore forbids unguarded
-- DELETE/UPDATE in a migration, and it is right to: a `DELETE FROM
-- whatsapp_intakes` here would quietly wipe real landlord submissions on every
-- future deploy, and nothing would ever fail.
--
-- Every statement below is pinned to an EXPLICIT, FROZEN LIST OF IDS captured
-- on 2026-09-03. Postgres never reuses a serial id, so once these rows are
-- gone every replay matches zero rows forever. That is what makes a destructive
-- statement acceptable in a file that runs again and again.
--
-- The listings delete carries a second guard — `status = 'archived'` — so that
-- even in some impossible id-reuse scenario it can never remove a live listing.
--
-- ORDER AND CASCADES. Deleting the listings does most of the work by itself:
-- listing_moderations, listing_social_posts, listing_views, listing_impressions
-- and listing_contact_events are all ON DELETE CASCADE, and
-- landlord_access_tokens.listing_id / whatsapp_intakes.listing_id are SET NULL.
--
-- listing_contact_numbers is the exception and the reason it is named
-- explicitly below: it has NO foreign key to listings at all, so a cascade will
-- not touch it and its 9 rows would be left pointing at listing ids that no
-- longer exist.
--
-- Verified before writing this: 0 of the 17 social rows were live. Every one was
-- already `pulled` or `skipped`, so nothing here abandons a post that is still
-- up on Facebook, Instagram or TikTok — deleting the row is our only handle for
-- taking one down, and there was none left to lose.

-- Audit rows describing the pilot's listings and intakes (57 rows).
DELETE FROM audit_logs
WHERE (entity_type = 'listing' AND entity_id IN (19, 21, 22, 23, 24, 25, 26, 27, 28))
   OR (entity_type = 'whatsapp_intake' AND entity_id IN (21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33));

-- No FK to listings, so this is NOT covered by the cascade below (9 rows).
DELETE FROM listing_contact_numbers
WHERE listing_id IN (19, 21, 22, 23, 24, 25, 26, 27, 28);

-- The intake queue itself (13 rows: 10 published, 2 needs_info, 1 rejected).
DELETE FROM whatsapp_intakes
WHERE id IN (21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33);

-- The 9 archived listings. Cascades listing_moderations (9), listing_social_posts
-- (17), and any views/impressions/contact events. This is also what clears the
-- back-office moderation page, which counts listings.moderation_status rather
-- than reading the listing_moderations history table.
DELETE FROM listings
WHERE id IN (19, 21, 22, 23, 24, 25, 26, 27, 28)
  AND status = 'archived';
