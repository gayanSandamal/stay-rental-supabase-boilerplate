-- Contact clicks: a tapped Call or WhatsApp button on a listing.
--
-- A view measures curiosity; a contact tap is the closest thing to a lead this
-- marketplace has, and it is the question landlords actually ask ("did anyone
-- call?"). It is also what gives paid visibility an honest justification —
-- what a Boost bought in leads rather than impressions.
--
-- A SEPARATE TABLE, not a `type` column on listing_views. Views are
-- high-volume and disposable; contact events are low-volume and are the thing
-- we join, chart and rank on. Sharing one table would make every existing view
-- query filter on a column it does not care about, and would put a hot index
-- on the row that gets written thirty times a minute per IP.
--
-- Replay-safe: every statement is IF NOT EXISTS, nothing touches existing rows,
-- and there is no backfill — a tap that happened before this table existed was
-- never recorded and cannot be inferred.
--
-- NB: no DO $$ block. The runner's splitter only closes a dollar block on a
-- line that is exactly `$$;`, so a file with one collapses into a single
-- statement on replay and silently swallows everything after the first
-- "already exists" (see the note at the top of 0040).

CREATE TABLE IF NOT EXISTS listing_contact_events (
  id serial PRIMARY KEY,
  listing_id integer NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  -- 'call' | 'whatsapp' — which button. Kept as its own column because the
  -- split is itself the insight: a Sri Lankan renter who WhatsApps rather than
  -- calls behaves differently, and landlords answer differently too.
  -- Text rather than an enum, matching the `channel` convention on
  -- whatsapp_intakes: adding a channel should not need a migration.
  channel varchar(16) NOT NULL,
  -- Which of the listing's numbers was tapped, when it is one of ours.
  -- NULLABLE on purpose: the publisher-phone fallback path on the listing page
  -- renders a number that has no listing_contact_numbers row at all.
  -- ON DELETE SET NULL, not CASCADE — unlinking a number from a listing must
  -- not erase the evidence that renters called it.
  contact_number_id integer REFERENCES listing_contact_numbers(id) ON DELETE SET NULL,
  occurred_at timestamp NOT NULL DEFAULT now()
);

-- The only shape we query: this listing's events, in a time window.
CREATE INDEX IF NOT EXISTS listing_contact_events_listing_idx
  ON listing_contact_events (listing_id, occurred_at);

-- Matches 0026: every table in this schema carries RLS. All access is through
-- server code on the pooled connection; no browser client touches this table.
ALTER TABLE listing_contact_events ENABLE ROW LEVEL SECURITY;
