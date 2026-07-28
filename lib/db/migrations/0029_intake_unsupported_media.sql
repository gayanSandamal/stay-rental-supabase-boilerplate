-- Track intakes whose sender attached media the pipeline can't ingest
-- (videos, voice notes, non-image documents). Replies use this to tell the
-- sender to resend attachments as regular WhatsApp photos.
ALTER TABLE whatsapp_intakes
  ADD COLUMN IF NOT EXISTS has_unsupported_media boolean NOT NULL DEFAULT false;
