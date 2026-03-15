-- Listing views for performance insights (Premium/Agency)
CREATE TABLE IF NOT EXISTS "listing_views" (
  "id" serial PRIMARY KEY NOT NULL,
  "listing_id" integer NOT NULL REFERENCES "listings"("id") ON DELETE CASCADE,
  "viewed_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "listing_views_listing_id_idx" ON "listing_views" ("listing_id");
CREATE INDEX IF NOT EXISTS "listing_views_viewed_at_idx" ON "listing_views" ("viewed_at");
