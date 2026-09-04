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
  date,
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

/**
 * Per-platform state of a social auto-publish job (migration 0040). One row per
 * (listing, platform), so a failure on one network never blocks the others and
 * each carries its own remote post id for takedown.
 */
export const socialPostStatusEnum = pgEnum('social_post_status', [
  'queued', // consent given, waiting for the publish sweeper
  'running', // claimed by a sweeper run (lease held)
  'posted', // live on the platform
  'failed', // gave up after retries, or a non-retriable error
  'skipped', // no API path — facebook_group, which ops post by hand
  'pulled', // taken down (or marked for manual takedown) after going live
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
  // 0042 — the language this landlord writes in, so a returning one is answered
  // correctly from their first message rather than after it. NULL = not known.
  preferredLanguage: varchar('preferred_language', { length: 8 }),
  subscriptionTier: varchar('subscription_tier', { length: 20 }).default('free'),
  subscriptionExpiresAt: timestamp('subscription_expires_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
  /*
   * Banned. Checked in getUser() so a LIVE session stops working immediately —
   * Supabase's own ban only stops new sign-ins, leaving the current token valid
   * until it expires, which is the window a ban exists to close.
   */
  bannedAt: timestamp('banned_at'),
  bannedReason: text('banned_reason'),
  /** No cascade: deleting the issuing admin must not erase who issued it. */
  bannedBy: integer('banned_by'),
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
  // 0049 — scheduled performance reports. 'off' | 'weekly' | 'daily'.
  // 'daily' is paid-tier only; the gate lives in lib/reports/prefs.ts so a
  // lapsed plan degrades to weekly instead of billing 30 templates a month.
  reportFrequency: varchar('report_frequency', { length: 10 }).notNull().default('weekly'),
  // END of the period last reported on — NOT the send time. Makes the job both
  // idempotent and gap-free: the next report covers (this, now].
  reportLastPeriodEnd: timestamp('report_last_period_end'),
  reportLastSentAt: timestamp('report_last_sent_at'),
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
  // Nullable: a recognised town is location enough (migration 0036).
  address: text('address'),
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
  // When the owner was told their listing went live. NULL on a published
  // listing means the announcement never landed — the sweeper reconciles those.
  landlordNotifiedAt: timestamp('landlord_notified_at'),
  photosManifest: text('photos_manifest'), // JSON array of PhotoManifestEntry
  archivedAt: timestamp('archived_at'), // set on archive; purged 30 days later

  // Social auto-publish (migration 0040). Consent is asked per listing, so all
  // four are per-listing facts rather than a landlord-level preference.
  // `socialPromptedAt` is the delivery record for the ask — a published listing
  // with NULL here is one the sweeper still owes a prompt (cf. landlordNotifiedAt).
  socialPromptedAt: timestamp('social_prompted_at'),
  socialConsentAt: timestamp('social_consent_at'),
  socialConsentSource: varchar('social_consent_source', { length: 20 }), // whatsapp | web | ops
  socialDeclinedAt: timestamp('social_declined_at'), // explicit no — stop asking
  // 0041 — the "here is where it went live" notice. Same delivery-record
  // contract as socialPromptedAt: stamped only once a message actually reached
  // the landlord, so a failed send is retried instead of silently dropped.
  socialResultsSentAt: timestamp('social_results_sent_at'),
});

// Listing views (for Premium/Agency performance insights)
export const listingViews = pgTable('listing_views', {
  id: serial('id').primaryKey(),
  listingId: integer('listing_id')
    .notNull()
    .references(() => listings.id, { onDelete: 'cascade' }),
  viewedAt: timestamp('viewed_at').notNull().defaultNow(),
  // sha256(ip + user-agent + VIEW_HASH_SALT + yyyy-mm-dd). Rotates daily, so it
  // separates "views" from "people" within a day without ever becoming a
  // cross-day identity. NULL on every row written before migration 0046 — a
  // window containing NULLs has no honest unique count, so readers report views
  // only rather than counting the rows that happen to carry a hash.
  visitorHash: varchar('visitor_hash', { length: 64 }),
});

// Contact clicks — a tapped Call or WhatsApp button on a listing (migration
// 0045). Deliberately NOT a `type` column on listing_views: views are
// high-volume and disposable, contact events are low-volume and are what the
// analytics actually join and chart.
export const listingContactEvents = pgTable('listing_contact_events', {
  id: serial('id').primaryKey(),
  listingId: integer('listing_id')
    .notNull()
    .references(() => listings.id, { onDelete: 'cascade' }),
  // 'call' | 'whatsapp' — see CONTACT_CHANNELS in lib/analytics/contact-events.
  channel: varchar('channel', { length: 16 }).notNull(),
  // Which of the listing's numbers was tapped, when it is one of ours. NULL for
  // the publisher-phone fallback, which has no listing_contact_numbers row.
  contactNumberId: integer('contact_number_id').references(
    () => listingContactNumbers.id,
    { onDelete: 'set null' }
  ),
  occurredAt: timestamp('occurred_at').notNull().defaultNow(),
});

// Daily rollup of search impressions (migration 0048): how many times a listing
// was served on a results page. A rollup rather than an event log — twenty rows
// per search on the busiest query in the product is not a cost this pool can
// carry. Written by lib/analytics/impressions.ts.
export const listingImpressions = pgTable(
  'listing_impressions',
  {
    listingId: integer('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    count: integer('count').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.listingId, table.day] })]
);

// Weekly market rent snapshots (migration 0047). Written by the weekly cron,
// read to say how a landlord's rent has moved RELATIVE to their market — a
// question live data cannot answer at all, which is why the writer ships long
// before the reader has enough history to be useful.
export const marketRentSnapshots = pgTable('market_rent_snapshots', {
  id: serial('id').primaryKey(),
  city: varchar('city', { length: 100 }).notNull(),
  bedrooms: integer('bedrooms').notNull(),
  avgRent: integer('avg_rent').notNull(),
  medianRent: integer('median_rent'),
  // How many active listings the reading was taken over. A later reader uses
  // this to discard a snapshot captured while the market was too thin to mean
  // anything, exactly as MIN_COMPARABLES_FOR_RENT does for live data.
  sampleSize: integer('sample_size').notNull(),
  capturedOn: date('captured_on').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
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
/**
 * A live "view the app as this user" session.
 *
 * BOTH IDENTITIES ARE COLUMNS. `actorUserId` is who is really at the keyboard;
 * `subjectUserId` is whose account they are looking at. Recording only the
 * subject is what turns an audit log into a false statement.
 *
 * Only the sha256 of the token is stored (same rule as landlordAccessTokens):
 * a database dump must not hand anyone a working session.
 */
export const impersonationSessions = pgTable('impersonation_sessions', {
  id: serial('id').primaryKey(),
  /** The admin. No cascade — deleting them must not erase the record. */
  actorUserId: integer('actor_user_id')
    .notNull()
    .references(() => users.id),
  subjectUserId: integer('subject_user_id')
    .notNull()
    .references(() => users.id),
  tokenHash: text('token_hash').notNull().unique(),
  /** Server-enforced ceiling; a forgotten tab stops working on its own. */
  expiresAt: timestamp('expires_at').notNull(),
  /** Set on exit or revoke. Live == ended_at IS NULL AND expires_at > now(). */
  endedAt: timestamp('ended_at'),
  actorIp: varchar('actor_ip', { length: 45 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

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
 * Pending "prove you hold this number" challenges for contact numbers added
 * through the website (the 60-second form, the full form, account settings).
 *
 * The code is only a CORRELATION token, never the proof: possession is proven
 * by the inbound WhatsApp message's sender number, which Meta has already
 * verified. So the code is stored sha256-only like every other credential here,
 * and matching it is not sufficient — `expectedPhone` must equal the sender.
 *
 * One live row per contact number: minting again supersedes the previous
 * challenge rather than accumulating guessable codes.
 */
export const phoneVerifications = pgTable('phone_verifications', {
  id: serial('id').primaryKey(),
  contactNumberId: integer('contact_number_id')
    .notNull()
    .references(() => userContactNumbers.id, { onDelete: 'cascade' })
    .unique(),
  /** Who asked. Audit trail + the notification target on success. */
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull().unique(),
  /**
   * The contact number in E.164 AS OF minting. Denormalized on purpose: if the
   * landlord edits the number after minting, the challenge must not silently
   * transfer to the new digits — a stale row simply stops matching.
   */
  expectedPhone: varchar('expected_phone', { length: 20 }).notNull(),
  channel: text('channel').notNull().default('whatsapp'),
  expiresAt: timestamp('expires_at').notNull(),
  /** Wrong-sender attempts, so a leaked code can't be brute-forced from numbers. */
  attempts: integer('attempts').notNull().default(0),
  consumedAt: timestamp('consumed_at'),
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

/**
 * Sri Lankan places. Source of truth for the listing location picker, the
 * WhatsApp town matcher (loaded into a cached in-process snapshot, see
 * lib/locations/store.ts) and radius search via lat/lng.
 */
export const locations = pgTable('locations', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  /** Stored, not computed: lower(name) in a WHERE clause cannot use an index. */
  nameLower: varchar('name_lower', { length: 120 }).notNull(),
  district: varchar('district', { length: 50 }).notNull(),
  province: varchar('province', { length: 50 }),
  latitude: decimal('latitude', { precision: 10, scale: 7 }),
  longitude: decimal('longitude', { precision: 10, scale: 7 }),
  /** Ranks the picker so common towns beat hamlets. */
  population: integer('population'),
  /** 'curated' = the hand-tuned list (aliases, wards) that must survive reseeds. */
  source: varchar('source', { length: 16 }).notNull().default('csv'),
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
  // 0053 — Easy Rent's own social account linked via OAuth (TikTok)
  'social_account_connected',
  // 0040 — social auto-publish
  'listing_social_consent_granted',
  'listing_social_published',
  'listing_social_pulled',
  // 0044 — ops confirming a takedown an API could not perform
  'listing_social_takedown_confirmed',
  // 0049 — scheduled landlord performance reports
  'landlord_report_sent',
  'landlord_report_prefs_changed',
  // 0051 — admin viewing the app as another user
  'impersonation_started',
  'impersonation_ended',
  // 0052 — account lifecycle
  'user_banned',
  'user_unbanned',
  'user_hard_deleted',
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
  locationPin: text('location_pin'),
  /** Town the sender picked from the disambiguation menu; overrides the parse. */
  cityOverride: varchar('city_override', { length: 120 }),
  districtOverride: varchar('district_override', { length: 50 }), // JSON {latitude, longitude, name?, address?} from a shared pin
  // 0042 — the language to answer this submission in. Decided once from the
  // first conclusive message, not per message: a Sinhala ad followed by "50000"
  // would otherwise flip the conversation back to English mid-submission.
  replyLanguage: varchar('reply_language', { length: 8 }),
  waMessageIds: text('wa_message_ids'), // JSON array (idempotency)
  parsedPayload: text('parsed_payload'), // JSON from the LLM parser
  // 0043 — the intake's memory of its own conversation, so answering a question
  // can never produce more questions. See lib/intake/accumulator.ts.
  /** JSON array: the fields our last question asked for. */
  askedFields: text('asked_fields'),
  /** Everything received since that question, cleared when we ask again. */
  pendingAnswer: text('pending_answer'),
  /** How many times we have asked; past the cap a human takes over. */
  needsInfoRounds: integer('needs_info_rounds').notNull().default(0),
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

/**
 * Social auto-publish jobs (migration 0040). One row per (listing, platform),
 * enforced by a unique index — that constraint IS the enqueue idempotency, so a
 * re-consent or a replayed webhook can never double-post.
 *
 * Row-per-platform rather than a JSON map on `listings`: each network has its
 * own lifecycle, remote id, retry budget and failure mode, and concurrent
 * workers claiming a shared JSON column would lose updates.
 *
 * `remotePostId` is the handle we need to delete the post again. Note that only
 * Facebook Page supports deletion via API — for Instagram and TikTok a takedown
 * is a note to ops, which is why `remotePermalink` is stored alongside it.
 */
export const listingSocialPosts = pgTable('listing_social_posts', {
  id: serial('id').primaryKey(),
  listingId: integer('listing_id')
    .notNull()
    .references(() => listings.id, { onDelete: 'cascade' }),
  /** facebook_page | instagram | tiktok | facebook_group */
  platform: text('platform').notNull(),
  status: socialPostStatusEnum('status').notNull().default('queued'),
  remotePostId: text('remote_post_id'),
  remotePermalink: text('remote_permalink'),
  /** Exactly what we sent — audit trail, and the paste source for facebook_group. */
  caption: text('caption'),
  attempts: integer('attempts').notNull().default(0),
  leaseUntil: timestamp('lease_until'),
  error: text('error'),
  postedAt: timestamp('posted_at'),
  pulledAt: timestamp('pulled_at'),
  pulledBy: integer('pulled_by').references(() => users.id),
  /**
   * The post went live and could NOT be removed through an API, so it is STILL
   * VISIBLE right now and only a human can take it down.
   *
   * `status = 'pulled'` cannot answer this on its own — it means "taken down OR
   * marked for manual takedown", which is exactly the ambiguity that let a post
   * stay up on Instagram while the row read as handled. Instagram and TikTok
   * have no delete endpoint, and a Facebook delete can simply fail, so this is
   * set from the ACTUAL result of `remove()`, never from the platform.
   */
  needsManualTakedown: boolean('needs_manual_takedown').notNull().default(false),
  /** When a human confirmed they deleted it by hand. NULL while outstanding. */
  manualTakedownAt: timestamp('manual_takedown_at'),
  manualTakedownBy: integer('manual_takedown_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * OAuth credentials for social accounts whose tokens ROTATE (migration 0040).
 *
 * Only TikTok needs this. Meta Page access tokens are long-lived and sit in an
 * env var; TikTok's access token expires in ~24h and its refresh token rotates
 * on every use, so the current pair has to be written back somewhere durable —
 * an env var cannot be updated by the running app.
 *
 * Service-role access only (RLS on, no policies). Never expose these rows to a
 * client, and never log the token values.
 */
export const socialAccounts = pgTable('social_accounts', {
  id: serial('id').primaryKey(),
  /** One connected account per platform. */
  platform: text('platform').notNull().unique(),
  /** The platform's own account identifier (TikTok calls it open_id). */
  externalAccountId: text('external_account_id'),
  displayName: text('display_name'),
  /** Cached, and expires: TikTok signs these. Refreshed on connect + creator_info. */
  avatarUrl: text('avatar_url'),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  expiresAt: timestamp('expires_at'),
  refreshExpiresAt: timestamp('refresh_expires_at'),
  scope: text('scope'),
  connectedBy: integer('connected_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

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
  contactEvents: many(listingContactEvents),
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

export const listingContactEventsRelations = relations(listingContactEvents, ({ one }) => ({
  listing: one(listings, {
    fields: [listingContactEvents.listingId],
    references: [listings.id],
  }),
  listingContactNumber: one(listingContactNumbers, {
    fields: [listingContactEvents.contactNumberId],
    references: [listingContactNumbers.id],
  }),
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

export const phoneVerificationsRelations = relations(phoneVerifications, ({ one }) => ({
  contactNumber: one(userContactNumbers, {
    fields: [phoneVerifications.contactNumberId],
    references: [userContactNumbers.id],
  }),
  user: one(users, {
    fields: [phoneVerifications.userId],
    references: [users.id],
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
export type ListingImpression = typeof listingImpressions.$inferSelect;
export type NewListingImpression = typeof listingImpressions.$inferInsert;
export type MarketRentSnapshot = typeof marketRentSnapshots.$inferSelect;
export type NewMarketRentSnapshot = typeof marketRentSnapshots.$inferInsert;
export type ListingContactEvent = typeof listingContactEvents.$inferSelect;
export type NewListingContactEvent = typeof listingContactEvents.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type LandlordAccessToken = typeof landlordAccessTokens.$inferSelect;
export type NewLandlordAccessToken = typeof landlordAccessTokens.$inferInsert;
export type PhoneVerification = typeof phoneVerifications.$inferSelect;
export type NewPhoneVerification = typeof phoneVerifications.$inferInsert;
export type IntakeConversation = typeof intakeConversations.$inferSelect;
export type NewIntakeConversation = typeof intakeConversations.$inferInsert;
export type ListingModeration = typeof listingModerations.$inferSelect;
export type NewListingModeration = typeof listingModerations.$inferInsert;
export type ImageModerationCacheRow = typeof imageModerationCache.$inferSelect;
export type NewImageModerationCacheRow = typeof imageModerationCache.$inferInsert;
export type ListingSocialPost = typeof listingSocialPosts.$inferSelect;
export type NewListingSocialPost = typeof listingSocialPosts.$inferInsert;
export type SocialAccount = typeof socialAccounts.$inferSelect;
export type NewSocialAccount = typeof socialAccounts.$inferInsert;
