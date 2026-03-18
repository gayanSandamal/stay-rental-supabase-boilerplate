-- Featured (LKR 500/7 days) and Urgent (LKR 150/7 days) as paid visibility products
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "featured_until" timestamp;
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "urgent_until" timestamp;
