-- WhatsApp concierge intake: raw submissions queue + listing attribution.

-- Attribution for listings created by Easy Rent Operations on a landlord's behalf
ALTER TABLE listings ADD COLUMN IF NOT EXISTS source_contact_name text;

-- Intake status enum
DO $$
BEGIN
  CREATE TYPE whatsapp_intake_status AS ENUM (
    'received', 'needs_info', 'published', 'manual_review', 'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

-- Intake queue (one row per sender conversation session)
CREATE TABLE IF NOT EXISTS whatsapp_intakes (
  id serial PRIMARY KEY,
  from_number text NOT NULL,
  profile_name text,
  message_text text,
  media_paths text,
  wa_message_ids text,
  parsed_payload text,
  status whatsapp_intake_status NOT NULL DEFAULT 'received',
  failure_reason text,
  listing_id integer REFERENCES listings(id),
  last_message_at timestamp NOT NULL DEFAULT now(),
  processed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_intakes_status_idx ON whatsapp_intakes (status);
CREATE INDEX IF NOT EXISTS whatsapp_intakes_from_number_idx ON whatsapp_intakes (from_number);

-- RLS: same posture as every other table (migration 0026) — the app connects
-- as postgres/service_role which bypass RLS; the public anon key gets nothing.
ALTER TABLE whatsapp_intakes ENABLE ROW LEVEL SECURITY;

-- New audit actions
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'listing_auto_published';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'whatsapp_intake_updated';
