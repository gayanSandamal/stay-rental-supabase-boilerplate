-- Sync featured boolean with featuredUntil (featured = true only when featuredUntil > now)
UPDATE "listings" SET featured = false WHERE featured_until IS NULL OR featured_until < NOW();
UPDATE "listings" SET featured = true WHERE featured_until IS NOT NULL AND featured_until > NOW();
