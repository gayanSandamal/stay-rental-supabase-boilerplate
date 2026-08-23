-- Stop the needs-info loop: give an intake a memory of its own conversation.
--
-- THE INCIDENT (intake #31, 2026-08-23, Horana). A landlord sent a complete
-- Sinhala ad and then answered three follow-up questions. The bot asked for the
-- address four times and never published. Worse, after the landlord ANSWERED,
-- the next question asked for MORE fields than the one before it:
--
--   12:20  → "we still need: the address and the town"
--   12:24  landlord sends the address
--   12:31  → "we still need: the property type, the address and the town"
--
-- Every turn appends to message_text and the whole blob is re-parsed from
-- scratch, keeping only that run's result. The rule parser is stable across
-- those turns (verified by replaying the stored text); the LLM fallback is not,
-- because it is asked only for the fields the rules missed and therefore gets a
-- different question every turn. Nothing remembered the previous answer.
--
-- These three columns are that memory:
--
--   asked_fields       what the last question actually asked for, so a reply
--                      can be credited to it. A landlord answering "the address
--                      is next to the Horana main road" has given us the
--                      address, whether or not a regex expecting "42 Temple
--                      Road" recognises it.
--   pending_answer     everything received since that question. Not derived
--                      from message_text by offset: several messages routinely
--                      arrive between processing runs and all of them are part
--                      of the answer. Cleared when we ask again.
--   needs_info_rounds  how many times we have asked. Past the cap the intake
--                      goes to a human instead of asking a third time. Asking
--                      the same person the same question three times is a
--                      defect the code should be able to notice about itself.
--
-- Replay-safe: three IF NOT EXISTS column adds, no data touched. Note that
-- run-all-migrations.ts has no applied-migrations ledger and REPLAYS THIS FILE
-- ON EVERY INVOCATION, forever, against a populated production database.
--
-- Deliberately NO backfill. NULL/0 is the truth for every existing row: we do
-- not know what those conversations were asked, and inventing a round count
-- would push live conversations straight to manual review on their next reply.

ALTER TABLE whatsapp_intakes ADD COLUMN IF NOT EXISTS asked_fields text;
ALTER TABLE whatsapp_intakes ADD COLUMN IF NOT EXISTS pending_answer text;
ALTER TABLE whatsapp_intakes
  ADD COLUMN IF NOT EXISTS needs_info_rounds integer NOT NULL DEFAULT 0;
