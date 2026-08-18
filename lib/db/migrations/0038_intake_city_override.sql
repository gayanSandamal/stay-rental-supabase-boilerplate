-- The town a sender picked from the disambiguation menu.
--
-- It cannot live in the message text. Re-parsing is how a needs_info reply gets
-- folded in, and that works only when the reply contains a town the matcher
-- recognises — precisely not the case for "keep what I typed", where the whole
-- point is that the catalogue does not know the name. An explicit override is
-- applied after parsing, in the same way a location pin used to be.
--
-- Both ADD COLUMN IF NOT EXISTS: run-all-migrations.ts replays every numbered
-- file forever, and neither statement touches existing data.

ALTER TABLE whatsapp_intakes
  ADD COLUMN IF NOT EXISTS city_override varchar(120);

ALTER TABLE whatsapp_intakes
  ADD COLUMN IF NOT EXISTS district_override varchar(50);
