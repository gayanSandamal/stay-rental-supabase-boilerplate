-- KEY MONEY, and more than one phone number on an import.
--
-- listings.key_money is a lump sum in LKR. It is the alternative to
-- deposit_months, never an addition: a listing states its upfront cost as N
-- months of rent OR as an amount, and lib/listings/upfront.ts writes one and
-- nulls the other. NULL here means the listing uses a deposit, which is every
-- existing row.
--
-- post_imports.extra_phones is JSON [{"phone","isWhatsApp"}] for the numbers an
-- advert prints besides the owner's. owner_phone_is_whatsapp defaults true, which is
-- what publishing has always assumed about the owner's number.
--
-- Safe to replay: IF NOT EXISTS throughout, no row is read or rewritten.

ALTER TABLE listings ADD COLUMN IF NOT EXISTS key_money numeric(12, 2);
ALTER TABLE post_imports ADD COLUMN IF NOT EXISTS extra_phones text;
ALTER TABLE post_imports ADD COLUMN IF NOT EXISTS owner_phone_is_whatsapp boolean NOT NULL DEFAULT true;
