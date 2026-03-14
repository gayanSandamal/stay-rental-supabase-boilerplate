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
} from 'drizzle-orm/pg-core';
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

// Lead status enum
export const leadStatusEnum = pgEnum('lead_status', [
  'new',
  'contacted',
  'view_scheduled',
  'no_show',
  'interested',
  'closed_won',
  'closed_lost',
]);

// Business Account Status enum
export const businessAccountStatusEnum = pgEnum('business_account_status', [
  'active',
  'suspended',
  'inactive',
]);

// Users table (updated for Stay Rental)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRoleEnum('role').notNull().default('tenant'),
  phone: varchar('phone', { length: 20 }),
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
  
  // Metadata
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  lastPingedAt: timestamp('last_pinged_at'), // For staleness tracking
  createdBy: integer('created_by').references(() => users.id), // User who created the listing
  businessAccountId: integer('business_account_id').references(() => businessAccounts.id), // Business account (if created by team member)
  publishedAt: timestamp('published_at'), // When listing was first published/approved
  expiresAt: timestamp('expires_at'), // When listing expires (publishedAt + 30 days)
});

// Leads table (viewing requests from tenants)
export const leads = pgTable('leads', {
  id: serial('id').primaryKey(),
  listingId: integer('listing_id')
    .notNull()
    .references(() => listings.id),
  tenantName: varchar('tenant_name', { length: 100 }).notNull(),
  tenantEmail: varchar('tenant_email', { length: 255 }).notNull(),
  tenantPhone: varchar('tenant_phone', { length: 20 }).notNull(),
  preferredDate: timestamp('preferred_date'),
  preferredTime: varchar('preferred_time', { length: 50 }),
  notes: text('notes'),
  status: leadStatusEnum('status').notNull().default('new'),
  assignedTo: integer('assigned_to').references(() => users.id), // Ops user
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Viewings table (scheduled viewings)
export const viewings = pgTable('viewings', {
  id: serial('id').primaryKey(),
  leadId: integer('lead_id')
    .notNull()
    .references(() => leads.id),
  listingId: integer('listing_id')
    .notNull()
    .references(() => listings.id),
  scheduledAt: timestamp('scheduled_at').notNull(),
  confirmedByLandlord: boolean('confirmed_by_landlord').default(false),
  confirmedByTenant: boolean('confirmed_by_tenant').default(false),
  notes: text('notes'),
  outcome: varchar('outcome', { length: 50 }), // interested, passed, no_show
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
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
]);

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

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  landlord: one(landlords, {
    fields: [users.id],
    references: [landlords.userId],
  }),
  savedSearches: many(savedSearches),
  assignedLeads: many(leads, {
    relationName: 'assignedOps',
  }),
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
  leads: many(leads),
  viewings: many(viewings),
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

export const leadsRelations = relations(leads, ({ one, many }) => ({
  listing: one(listings, {
    fields: [leads.listingId],
    references: [listings.id],
  }),
  viewings: many(viewings),
  assignedOps: one(users, {
    fields: [leads.assignedTo],
    references: [users.id],
    relationName: 'assignedOps',
  }),
}));

export const viewingsRelations = relations(viewings, ({ one }) => ({
  lead: one(leads, {
    fields: [viewings.leadId],
    references: [leads.id],
  }),
  listing: one(listings, {
    fields: [viewings.listingId],
    references: [listings.id],
  }),
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
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type Viewing = typeof viewings.$inferSelect;
export type NewViewing = typeof viewings.$inferInsert;
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
