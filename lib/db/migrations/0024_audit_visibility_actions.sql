-- Add visibility activation actions to audit_action enum
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'listing_boost_activated';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'listing_featured_activated';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'listing_urgent_activated';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'listing_bundle_activated';
