-- WhatsApp location pins: a sender can answer "we still need the street
-- address" by sharing a native location pin. Stored as JSON
-- {latitude, longitude, name?, address?} on the intake row; copied onto the
-- listing's latitude/longitude at creation time.
ALTER TABLE whatsapp_intakes ADD COLUMN IF NOT EXISTS location_pin text;
