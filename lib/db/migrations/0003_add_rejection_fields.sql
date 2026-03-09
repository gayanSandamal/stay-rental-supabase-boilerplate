-- Add rejected status to listing_status enum
ALTER TYPE listing_status ADD VALUE IF NOT EXISTS 'rejected';

-- Add rejection fields to listings table
ALTER TABLE listings ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS rejected_by INTEGER REFERENCES users(id);

-- Create index for faster queries on rejected listings
CREATE INDEX IF NOT EXISTS idx_listings_rejected_at ON listings(rejected_at);
CREATE INDEX IF NOT EXISTS idx_listings_rejected_by ON listings(rejected_by);

