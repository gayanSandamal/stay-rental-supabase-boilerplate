import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  decimal,
  pgEnum,
  uuid,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';

// User roles enum
export const userRoleEnum = pgEnum('user_role', [
  'tenant',
  'landlord',
  'ops',
  'admin',
]);

// Listing status enum
export const listingStatusEnum = pgEnum('listing_status', [
  'pending',
  'active',
  'rented',
  'archived',
  'rejected',
  'expired',
]);

/**
 * Automated approval state (migration 0032), independent of the public
 * listing_status: a listing can be `active` + `passed`, or `pending` + `held`.
 */
export const listingModerationStatusEnum = pgEnum('listing_moderation_status', [
  'queued', // waiting for the moderation sweeper
  'running', // claimed by a sweeper run (lease held)
  'passed', // all checks green (possibly after dropping bad photos)
  'held', // needs a human: incoherent text, unsupported language, unsafe image
  'error', // moderation could not run after retries — fail closed
  'skipped', // moderation not configured/enabled for this row
]);

// Business Account Status enum
export const businessAccountStatusEnum = pgEnum('business_account_status', [
  'active',
  'suspended',
  'inactive',
]);

// Users table (updated for Easy Rent)
// auth_user_id links to Supabase auth.users; password_hash nullable for Supabase Auth users
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  authUserId: uuid('auth_user_id'),
  name: varchar('name', { length: 100 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash'),
  role: userRoleEnum('role').notNull().default('tenant'),
  phone: varchar('phone', { length: 20 }), // user-typed, UNVERIFIED — never match on it
  // Verified WhatsApp identity (E.164), written only by the intake pipeline after
  // Meta has proven possession of the number. Unique among live accounts
  // (partial index in migration 0030).
  waPhone: varchar('wa_phone', { length: 20 }),
  subscriptionTier: varchar('subscription_tier', { length: 20 }).default('free'),
  subscriptionExpiresAt: timestamp('subscription_expires_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

// Landlords table (extends users with verification info)
export const landlords = pgTable('landlords', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id)
    .unique(),
  nic: varchar('nic', { length: 20 }), // National Identity Card
  ownershipDocUrl: text('ownership_doc_url'), // Deed/lease agreement
  kycVerified: boolean('kyc_verified').notNull().default(false),
  kycVerifiedAt: timestamp('kyc_verified_at'),
  kycVerifiedBy: integer('kyc_verified_by').references(() => users.id),
  landlordPlanTier: varchar('landlord_plan_tier', { length: 20 }).default('free'),
  landlordPlanExpiresAt: timestamp('landlord_plan_expires_at'),
  boostsUsedThisMonth: integer('boosts_used_this_month').notNull().default(0),
  boostsMonthResetAt: timestamp('boosts_month_reset_at'),
  profileSlug: varchar('profile_slug', { length: 50 }), // Custom URL (Premium+); one-time set
  publicId: varchar('public_id', { length: 36 })
    .notNull()
    .default(sql`gen_random_uuid()::text`)
    .unique(), // UUID for free profile URLs
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Listings table (main property listings)
export const listings = pgTable('listings', {
  id: serial('id').primaryKey(),
  landlordId: integer('landlord_id')
    .notNull()
    .references(() => landlords.id),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  status: listingStatusEnum('status').notNull().default('pending'),
  
  // Location
  address: text('address').notNull(),
  city: varchar('city', { length: 100 }).notNull().default('Colombo'),
  district: varchar('district', { length: 100 }),
  latitude: decimal('latitude', { precision: 10, scale: 8 }),
  longitude: decimal('longitude', { precision: 11, scale: 8 }),
  
  // Property details
  propertyType: varchar('property_type', { length: 50 }), // house, apartment, room
  bedrooms: integer('bedrooms').notNull(),
  bathrooms: integer('bathrooms'),
  areaSqft: integer('area_sqft'),
  
  // Pricing
  rentPerMonth: decimal('rent_per_month', { precision: 12, scale: 2 }).notNull(),
  depositMonths: integer('deposit_months').default(3),
  utilitiesIncluded: boolean('utilities_included').default(false),
  serviceCharge: decimal('service_charge', { precision: 12, scale: 2 }),
  
  // Sri Lanka-specific resilience features
  powerBackup: varchar('power_backup', { length: 50 }), // generator, solar, ups, none
  waterSource: varchar('water_source', { length: 50 }), // mains, tank, borehole
  waterTankSize: integer('water_tank_size'), // in liters
  hasFiber: boolean('has_fiber').default(false),
  fiberISPs: text('fiber_isps'), // comma-separated ISPs
  
  // Climate & comfort
  acUnits: integer('ac_units'),
  fans: integer('fans'),
  ventilation: varchar('ventilation', { length: 50 }), // good, fair, poor
  
  // Safety & security
  isGated: boolean('is_gated').default(false),
  hasGuard: boolean('has_guard').default(false),
  hasCCTV: boolean('has_cctv').default(false),
  hasBurglarBars: boolean('has_burglar_bars').default(false),
  
  // Other features
  parking: boolean('parking').default(false),
  parkingSpaces: integer('parking_spaces'),
  petsAllowed: boolean('pets_allowed').default(false),
  noticePeriodDays: integer('notice_period_days').default(30),
  
  // Verification
  verified: boolean('verified').notNull().default(false),
  verifiedAt: timestamp('verified_at'),
  verifiedBy: integer('verified_by').references(() => users.id),
  visited: boolean('visited').notNull().default(false),
  visitedAt: timestamp('visited_at'),
  visitedBy: integer('visited_by').references(() => users.id),
  
  // Rejection
  rejectionReason: text('rejection_reason'),
  rejectedAt: timestamp('rejected_at'),
  rejectedBy: integer('rejected_by').references(() => users.id),
  
  // Photos
  photos: text('photos'), // JSON array of photo URLs

  // Concierge attribution: the real owner's display name when the listing was
  // created by Easy Rent Operations on a landlord's behalf (WhatsApp intake).
  sourceContactName: text('source_contact_name'),

  // Premium / exclusive
  exclusive: boolean('exclusive').notNull().default(false), // Premium renters only

  // Boost (LKR 250/7 days), Featured (LKR 500/7 days), Urgent (LKR 150/7 days)
  boostedUntil: timestamp('boosted_until'),
  featured: boolean('featured').notNull().default(false),
  featuredAt: timestamp('featured_at'),
  featuredUntil: timestamp('featured_until'),
  urgentUntil: timestamp('urgent_until'),
  
  // Metadata
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  lastPingedAt: timestamp('last_pinged_at'), // For staleness tracking
  createdBy: integer('created_by').references(() => users.id), // User who created the listing
  businessAccountId: integer('business_account_id').references(() => businessAccounts.id), // Business account (if created by team member)
  publishedAt: timestamp('published_at'), // When listing was first published/approved
  expiresAt: timestamp('expires_at'), // When listing expires (publishedAt + 30 days)

  // Automated approval (migration 0032). `photos` above stays the array of
  // PUBLIC (compressed + watermarked) URLs every reader already parses;
  // photosManifest is the source of truth carrying originals, hashes and
  // per-image verdicts.
  moderationStatus: listingModerationStatusEnum('moderation_status').notNull().default('skipped'),
  moderationSummary: text('moderation_summary'), // short ops/landlord-facing line
  moderationLanguage: varchar('moderation_language', { length: 12 }),
  moderatedAt: timestamp('moderated_at'),
  moderationAttempts: integer('moderation_attempts').notNull().default(0),
  moderationLeaseUntil: timestamp('moderation_lease_until'),
  photosManifest: text('photos_manifest'), // JSON array of PhotoManifestEntry
  archivedAt: timestamp('archived_at'), // set on archive; purged 30 days later
});

// Listing views (for Premium/Agency performance insights)
export const listingViews = pgTable('listing_views', {
  id: serial('id').primaryKey(),
  listingId: integer('listing_id')
    .notNull()
    .references(() => listings.id, { onDelete: 'cascade' }),
  viewedAt: timestamp('viewed_at').notNull().defaultNow(),
});

// Saved searches table (for tenants)
export const savedSearches = pgTable('saved_searches', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  name: varchar('name', { length: 100 }).notNull(),
  searchParams: text('search_params').notNull(), // JSON object
  emailAlerts: boolean('email_alerts').default(true),
  whatsappAlerts: boolean('whatsapp_alerts').default(false),
  lastAlertAt: timestamp('last_alert_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Business Accounts table
export const businessAccounts = pgTable('business_accounts', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  address: text('address'),
  status: businessAccountStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  createdBy: integer('created_by').references(() => users.id), // Platform admin who created it
});

// Business Account Members table (team members)
export const businessAccountMembers = pgTable('business_account_members', {
  id: serial('id').primaryKey(),
  businessAccountId: integer('business_account_id')
    .notNull()
    .references(() => businessAccounts.id, { onDelete: 'cascade' }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
    .unique(), // One user can only belong to one business account
  role: varchar('role', { length: 50 }).notNull().default('member'), // owner, admin, member
  isActive: boolean('is_active').notNull().default(true),
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// User Contact Numbers table (stores contact numbers for users and business accounts)
export const userContactNumbers = pgTable('user_contact_numbers', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }), // For individual users
  businessAccountId: integer('business_account_id').references(() => businessAccounts.id, { onDelete: 'cascade' }), // For business accounts
  phoneNumber: varchar('phone_number', { length: 20 }).notNull(),
  isWhatsApp: boolean('is_whatsapp').notNull().default(false),
  label: varchar('label', { length: 50 }), // e.g., "Primary", "Office", "Mobile"
  isActive: boolean('is_active').notNull().default(true),
  verified: boolean('verified').notNull().default(false), // Whether verified by platform support
  verifiedAt: timestamp('verified_at'), // When verified
  verifiedBy: integer('verified_by').references(() => users.id), // Platform support user who verified
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  // Ensure either userId or businessAccountId is set, but not both
});

// Listing Contact Numbers junction table (links contact numbers to listings)
export const listingContactNumbers = pgTable('listing_contact_numbers', {
  id: serial('id').primaryKey(),
  listingId: integer('listing_id')
    .notNull()
    .references(() => listings.id, { onDelete: 'cascade' }),
  contactNumberId: integer('contact_number_id')
    .notNull()
    .references(() => userContactNumbers.id, { onDelete: 'cascade' }),
  isNew: boolean('is_new').notNull().default(false), // Whether this contact number was newly added to this listing
  wasChanged: boolean('was_changed').notNull().default(false), // Whether this contact number was modified after being linked
  linkedAt: timestamp('linked_at').notNull().defaultNow(), // When this contact number was first linked to this listing
  createdAt: timestamp('created_at').notNull().defaultNow(),
  // Unique constraint: a contact number can only be linked once per listing
});

// Password reset tokens table
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/**
 * Passwordless "sign me in and take me there" links we send over WhatsApp.
 * Unlike passwordResetTokens these are REUSABLE — the message stays in the
 * landlord's chat thread and they reopen it weeks later — with a sliding
 * expiry and a revocation column. Only the sha256 hash is stored, so an
 * issued URL can never be reprinted (rotation = mint a new row).
 */
export const landlordAccessTokens = pgTable('landlord_access_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  /** Listing this link was minted for (provenance only — the session is account-wide). */
  listingId: integer('listing_id').references(() => listings.id, { onDelete: 'set null' }),
  channel: text('channel').notNull().default('whatsapp'),
  expiresAt: timestamp('expires_at').notNull(),
  lastUsedAt: timestamp('last_used_at'),
  useCount: integer('use_count').notNull().default(0),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/**
 * Per-sender conversation state for multi-step commands (today: the delete
 * confirmation). Separate from whatsapp_intakes, which models one property
 * submission. `handledMessageIds` stops Meta redelivery re-running a command.
 */
export const intakeConversations = pgTable('intake_conversations', {
  id: serial('id').primaryKey(),
  channel: text('channel').notNull().default('whatsapp'),
  fromNumber: text('from_number').notNull(),
  /** idle | delete_pick | delete_confirm */
  state: text('state').notNull().default('idle'),
  payload: text('payload'), // JSON: e.g. the numbered listing ids on offer
  expiresAt: timestamp('expires_at'),
  handledMessageIds: text('handled_message_ids'), // JSON array, newest ~20
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Audit log action enum
export const auditActionEnum = pgEnum('audit_action', [
  'listing_created',
  'listing_updated',
  'listing_approved',
  'listing_rejected',
  'listing_archived',
  'listing_expired',
  'listing_deleted',
  'lead_created',
  'lead_status_changed',
  'viewing_scheduled',
  'viewing_outcome',
  'user_created',
  'user_updated',
  'business_account_created',
  'business_account_updated',
  'member_added',
  'member_removed',
  'contact_verified',
  'kyc_verified',
  'property_visited',
  'data_exported',
  'listing_boost_activated',
  'listing_featured_activated',
  'listing_urgent_activated',
  'listing_bundle_activated',
  'feature_flag_updated',
  'listing_auto_published',
  'whatsapp_intake_updated',
  // 0030 — WhatsApp landlord accounts + passwordless links
  'wa_account_created',
  'auth_link_issued',
  'auth_link_redeemed',
  'listing_purged',
  // 0032 — automated moderation
  'listing_moderation_passed',
  'listing_moderation_held',
  'listing_moderation_overridden',
  'listing_photos_dropped',
]);

// WhatsApp concierge intake statuses
export const whatsappIntakeStatusEnum = pgEnum('whatsapp_intake_status', [
  'received', // raw messages stored, awaiting processing
  'needs_info', // replied asking for missing fields; new messages reopen it
  'published', // listing created (auto-published or pending per flag)
  'manual_review', // parser unavailable or checks failed — ops must handle
  'rejected', // ops rejected the intake
]);

// Raw WhatsApp concierge submissions (one row per sender conversation session)
export const whatsappIntakes = pgTable('whatsapp_intakes', {
  id: serial('id').primaryKey(),
  channel: text('channel').notNull().default('whatsapp'), // intake channel (whatsapp, telegram…)
  fromNumber: text('from_number').notNull(), // sender's channel-scoped id (WhatsApp: digits)
  profileName: text('profile_name'), // WhatsApp pushname at time of message
  messageText: text('message_text'), // concatenated text messages
  mediaPaths: text('media_paths'), // JSON array of stored image URLs
  waMessageIds: text('wa_message_ids'), // JSON array (idempotency)
  parsedPayload: text('parsed_payload'), // JSON from the LLM parser
  status: whatsappIntakeStatusEnum('status').notNull().default('received'),
  failureReason: text('failure_reason'),
  // Sender attached media we can't ingest (video/voice/non-image documents) —
  // replies tell them to resend as photos.
  hasUnsupportedMedia: boolean('has_unsupported_media').notNull().default(false),
  listingId: integer('listing_id').references(() => listings.id),
  lastMessageAt: timestamp('last_message_at').notNull().defaultNow(),
  processedAt: timestamp('processed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/** One row per moderation attempt: ops audit trail + cost ledger. */
export const listingModerations = pgTable('listing_moderations', {
  id: serial('id').primaryKey(),
  listingId: integer('listing_id')
    .notNull()
    .references(() => listings.id, { onDelete: 'cascade' }),
  attempt: integer('attempt').notNull().default(1),
  outcome: listingModerationStatusEnum('outcome').notNull(),
  language: varchar('language', { length: 12 }),
  verdict: text('verdict'), // JSON: the full ModerationVerdict
  reasons: text('reasons'), // JSON array of landlord-facing strings
  imagesChecked: integer('images_checked').notNull().default(0),
  imagesDropped: integer('images_dropped').notNull().default(0),
  imagesCached: integer('images_cached').notNull().default(0),
  model: varchar('model', { length: 64 }),
  promptVersion: integer('prompt_version').notNull().default(1),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  durationMs: integer('duration_ms'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/**
 * Content-addressed image verdict cache. Image checks judge the image alone, so
 * a verdict is reusable across listings and across edits — this is what makes
 * re-approval on edit nearly free. `humanOverride` makes an ops "restore this
 * photo" decision permanent across future re-runs.
 */
export const imageModerationCache = pgTable(
  'image_moderation_cache',
  {
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    promptVersion: integer('prompt_version').notNull().default(1),
    verdict: varchar('verdict', { length: 16 }).notNull(), // pass | reject
    severity: varchar('severity', { length: 16 }), // cosmetic | safety
    reasons: text('reasons'), // JSON array
    raw: text('raw'), // JSON: provider response, kept for prompt tuning
    model: varchar('model', { length: 64 }),
    humanOverride: boolean('human_override').notNull().default(false),
    overriddenBy: integer('overridden_by').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.contentHash, table.promptVersion] })]
);

// Audit log table
export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  action: auditActionEnum('action').notNull(),
  entityType: varchar('entity_type', { length: 50 }).notNull(), // listing, lead, user, etc.
  entityId: integer('entity_id'),
  userId: integer('user_id').references(() => users.id),
  metadata: text('metadata'), // JSON with extra context
  ipAddress: varchar('ip_address', { length: 45 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Feature flag overrides — defaults live in lib/feature-flags.ts; rows here
// override them at runtime (managed from the back-office settings page).
export const featureFlags = pgTable('feature_flags', {
  key: varchar('key', { length: 100 }).primaryKey(),
  value: text('value').notNull(), // 'true'/'false' for booleans, numeric string for config flags
  updatedBy: integer('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type FeatureFlagRow = typeof featureFlags.$inferSelect;
export type NewFeatureFlagRow = typeof featureFlags.$inferInsert;

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  landlord: one(landlords, {
    fields: [users.id],
    references: [landlords.userId],
  }),
  savedSearches: many(savedSearches),
  notifications: many(notifications),
}));

export const landlordsRelations = relations(landlords, ({ one, many }) => ({
  user: one(users, {
    fields: [landlords.userId],
    references: [users.id],
  }),
  listings: many(listings),
  kycVerifier: one(users, {
    fields: [landlords.kycVerifiedBy],
    references: [users.id],
    relationName: 'kycVerifier',
  }),
}));

export const listingsRelations = relations(listings, ({ one, many }) => ({
  landlord: one(landlords, {
    fields: [listings.landlordId],
    references: [landlords.id],
  }),
  verifier: one(users, {
    fields: [listings.verifiedBy],
    references: [users.id],
    relationName: 'verifier',
  }),
  visitor: one(users, {
    fields: [listings.visitedBy],
    references: [users.id],
    relationName: 'visitor',
  }),
  // Make these optional - they'll only work after migration
  creator: one(users, {
    fields: [listings.createdBy],
    references: [users.id],
    relationName: 'creator',
  }),
  businessAccount: one(businessAccounts, {
    fields: [listings.businessAccountId],
    references: [businessAccounts.id],
  }),
  contactNumbers: many(listingContactNumbers),
}));

export const savedSearchesRelations = relations(savedSearches, ({ one }) => ({
  user: one(users, {
    fields: [savedSearches.userId],
    references: [users.id],
  }),
}));

// Add business account relations
export const businessAccountsRelations = relations(businessAccounts, ({ one, many }) => ({
  creator: one(users, {
    fields: [businessAccounts.createdBy],
    references: [users.id],
    relationName: 'businessAccountCreator',
  }),
  members: many(businessAccountMembers),
  listings: many(listings),
}));

export const businessAccountMembersRelations = relations(businessAccountMembers, ({ one }) => ({
  businessAccount: one(businessAccounts, {
    fields: [businessAccountMembers.businessAccountId],
    references: [businessAccounts.id],
  }),
  user: one(users, {
    fields: [businessAccountMembers.userId],
    references: [users.id],
  }),
}));

export const userContactNumbersRelations = relations(userContactNumbers, ({ one, many }) => ({
  user: one(users, {
    fields: [userContactNumbers.userId],
    references: [users.id],
  }),
  businessAccount: one(businessAccounts, {
    fields: [userContactNumbers.businessAccountId],
    references: [businessAccounts.id],
  }),
  listingContacts: many(listingContactNumbers),
}));

export const listingContactNumbersRelations = relations(listingContactNumbers, ({ one }) => ({
  listing: one(listings, {
    fields: [listingContactNumbers.listingId],
    references: [listings.id],
  }),
  contactNumber: one(userContactNumbers, {
    fields: [listingContactNumbers.contactNumberId],
    references: [userContactNumbers.id],
  }),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id],
  }),
}));

export const landlordAccessTokensRelations = relations(landlordAccessTokens, ({ one }) => ({
  user: one(users, {
    fields: [landlordAccessTokens.userId],
    references: [users.id],
  }),
  listing: one(listings, {
    fields: [landlordAccessTokens.listingId],
    references: [listings.id],
  }),
}));

export const listingModerationsRelations = relations(listingModerations, ({ one }) => ({
  listing: one(listings, {
    fields: [listingModerations.listingId],
    references: [listings.id],
  }),
}));

// Notifications table (in-app notification center)
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(), // new_lead, saved_search_alert, etc.
  title: varchar('title', { length: 200 }).notNull(),
  body: text('body'),
  link: varchar('link', { length: 500 }), // URL to navigate when clicked
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Landlord = typeof landlords.$inferSelect;
export type NewLandlord = typeof landlords.$inferInsert;
export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
export type SavedSearch = typeof savedSearches.$inferSelect;
export type NewSavedSearch = typeof savedSearches.$inferInsert;
export type UserContactNumber = typeof userContactNumbers.$inferSelect;
export type NewUserContactNumber = typeof userContactNumbers.$inferInsert;
export type ListingContactNumber = typeof listingContactNumbers.$inferSelect;
export type NewListingContactNumber = typeof listingContactNumbers.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type LandlordAccessToken = typeof landlordAccessTokens.$inferSelect;
export type NewLandlordAccessToken = typeof landlordAccessTokens.$inferInsert;
export type IntakeConversation = typeof intakeConversations.$inferSelect;
export type NewIntakeConversation = typeof intakeConversations.$inferInsert;
export type ListingModeration = typeof listingModerations.$inferSelect;
export type NewListingModeration = typeof listingModerations.$inferInsert;
export type ImageModerationCacheRow = typeof imageModerationCache.$inferSelect;
export type NewImageModerationCacheRow = typeof imageModerationCache.$inferInsert;
