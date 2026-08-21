/**
 * Feature flags.
 *
 * `featureFlagDefaults` are the compile-time defaults. At runtime they can be
 * overridden per-instance from the `feature_flags` DB table (see
 * `lib/feature-flags-store.ts`), which is what powers the back-office toggle UI.
 *
 * `isFeatureEnabled` / `getFeatureValue` stay synchronous and read from the
 * resolved snapshot, so every existing caller keeps working unchanged. Until
 * `loadFeatureFlags()` has run in a given server instance the snapshot equals
 * the defaults below, so behaviour is identical to the old code-only flags.
 *
 * The snapshot is in-memory and per-instance (like `lib/rate-limit.ts`); DB
 * overrides are picked up on the next cache refresh (TTL in the store).
 */

export const featureFlagDefaults = {
  // Platform features
  enableLandlordSelfService: true,
  enableSocialSharing: true,
  enableDuplicateDetection: true,
  enableAuditLog: true,
  enableRateLimiting: true,
  enableSimilarListings: true,
  enableDataExport: true,
  enableLeadNurturing: true,
  enableAnalyticsDashboard: true,
  enablePasswordReset: true,

  // Marketing / public site
  // Master switch for paid visibility. While OFF the platform presents as fully
  // free: the homepage pricing section, price copy, and every "upgrade to a paid
  // plan" CTA are hidden. Flip ON when paid visibility launches.
  enablePricingSection: false,

  // While ON the public site shows honest founding-stage copy instead of
  // social-proof claims (property counts, ratings, testimonials) that real
  // usage does not yet back. Switch OFF once the platform has genuine numbers —
  // and make sure the claims are updated to the real figures at that point.
  showFoundingStageCopy: true,

  // "WhatsApp us 6 photos — we list it for you" concierge CTAs. Only effective
  // when NEXT_PUBLIC_WHATSAPP_SUPPORT is configured; CTAs hide themselves
  // otherwise, so default-ON is safe. Kill here if WhatsApp volume overwhelms ops.
  enableWhatsAppConcierge: true,

  // The 60-second quick-list form (/dashboard/listings/new?mode=quick): 6
  // required fields create a normal pending listing; ops enriches details
  // during the verification call. Off → entry points hide, the quick/full
  // toggle is not rendered, and the page always opens in full mode.
  enableQuickList: true,

  // WhatsApp Business intake pipeline (webhook + processing cron). Dormant
  // until the WHATSAPP_* env vars are configured.
  enableWhatsAppIntake: true,

  // OWNER DECISION (2026-07): intake listings that pass automated checks are
  // published immediately — including first-time landlords — without human
  // review. Flip OFF to route them to `pending` for one-tap ops approval
  // instead (recommended fallback if scam/junk listings appear).
  autoPublishWhatsAppIntakes: true,

  // Self-service "prove you hold this number" for contact numbers added on the
  // WEBSITE (60-second form, full form, settings). Numbers arriving through the
  // WhatsApp intake are verified at insert; this is the only route to verified
  // for every other path. Rides on the intake webhook, so it is doubly dormant:
  // also needs enableWhatsAppIntake ON plus NEXT_PUBLIC_WHATSAPP_SUPPORT set —
  // the button hides itself otherwise. OFF only stops NEW codes being minted;
  // codes already in a landlord's chat stay redeemable so nobody is stranded.
  enablePhoneVerification: true,

  // Strip phone numbers from a listing's description during moderation unless
  // the number is one the owner has VERIFIED. An unverified number in prose is
  // the one route by which an unverified — possibly someone else's — number
  // reaches a renter, and it routes around the verified badge the marketplace
  // is built on. Deterministic, no model call. OFF leaves descriptions as sent.
  scrubUnverifiedContacts: true,

  // LLM fallback for the deterministic intake rule parser: when required
  // fields are still missing after rule parsing, ask a model for ONLY those
  // fields and merge the fill-ins (rule values always win). Runs on
  // SILICONFLOW_API_KEY — the same key the moderation engine uses — and is a
  // no-op without it. OFF = rules only, zero cost.
  enableLlmParserFallback: false,

  // WhatsApp landlords get their own account and self-service edit links.
  // OFF keeps today's behaviour: listings owned by Easy Rent Operations.
  enableWhatsAppLandlordAccounts: false,

  // Richer WhatsApp conversation UX: read receipts + typing indicator, an
  // instant "got it" ack (the parse reply still takes ~5 min on the cron),
  // tappable delete menu/confirm buttons, and a share-location button when the
  // address is missing. OFF keeps replies plain-text and ack-free as before.
  enableWhatsAppRichReplies: false,

  // Automated approval (intake v2). Master switch OFF until the prompts have
  // been calibrated against real listings — with it off, publishing behaves
  // exactly as it does today.
  enableListingModeration: false,
  moderateImages: true,
  moderateTextCoherence: true,
  holdOnUnsafeImages: true,
  moderationFailOpen: false,
  // ONE number, not two. A separate "how many to check" and "how many to
  // publish" can only be wrong: check < publish publishes unchecked photos,
  // check > publish pays the provider for photos that can never appear. The
  // only safe relation is equality, so the cost ceiling is derived from the
  // product cap rather than configured alongside it.
  maxPhotosPerListing: 6,
  enforcePhotoCap: true,
  // Compression + watermark, independent of the AI checks.
  enableImageProcessing: false,
  watermarkListingImages: true,

  // Numeric / config flags
  listingExpirationDays: 30,
} as const;

export type FeatureFlags = {
  -readonly [K in keyof typeof featureFlagDefaults]: (typeof featureFlagDefaults)[K];
};
export type FeatureFlag = keyof typeof featureFlagDefaults;
export type FeatureFlagValue = boolean | number;

export interface FeatureFlagMeta {
  label: string;
  description: string;
  group: 'Platform' | 'Marketing' | 'Configuration';
  /** Affects the whole app — surfaced as a toggle switch in the back office. */
  appWide: boolean;
  /** Safe to expose to the browser via the public /api/feature-flags endpoint. */
  public: boolean;
}

export const featureFlagMeta: Record<FeatureFlag, FeatureFlagMeta> = {
  enableLandlordSelfService: {
    label: 'Landlord self-service',
    description: 'Let landlords manage their own listings via the dashboard.',
    group: 'Platform',
    appWide: true,
    public: true,
  },
  enableSocialSharing: {
    label: 'Social sharing',
    description: 'Show social share buttons on listing pages.',
    group: 'Platform',
    appWide: true,
    public: true,
  },
  enableDuplicateDetection: {
    label: 'Duplicate detection',
    description: 'Flag likely-duplicate listings on creation.',
    group: 'Platform',
    appWide: true,
    public: false,
  },
  enableAuditLog: {
    label: 'Audit logging',
    description: 'Record admin/ops actions to the audit log. Turning this off stops new audit entries platform-wide.',
    group: 'Platform',
    appWide: true,
    public: false,
  },
  enableRateLimiting: {
    label: 'Rate limiting',
    description: 'Throttle listing creation, uploads, contact reveals and view tracking. Disable only for debugging.',
    group: 'Platform',
    appWide: true,
    public: false,
  },
  enableSimilarListings: {
    label: 'Similar listings',
    description: 'Show the "similar listings" module on listing detail pages.',
    group: 'Platform',
    appWide: true,
    public: true,
  },
  enableDataExport: {
    label: 'Data export',
    description: 'Allow admins to export listing data.',
    group: 'Platform',
    appWide: true,
    public: false,
  },
  enableLeadNurturing: {
    label: 'Lead nurturing emails',
    description: 'Send saved-search alerts and nurturing emails.',
    group: 'Platform',
    appWide: true,
    public: false,
  },
  enableAnalyticsDashboard: {
    label: 'Analytics dashboard',
    description: 'Enable the landlord analytics dashboard.',
    group: 'Platform',
    appWide: true,
    public: true,
  },
  enablePasswordReset: {
    label: 'Password reset',
    description: 'Allow self-service password reset.',
    group: 'Platform',
    appWide: true,
    public: true,
  },
  enablePricingSection: {
    label: 'Paid visibility / pricing',
    description: 'Master switch for paid visibility. While off, the pricing section, price copy and all upgrade CTAs are hidden and the platform presents as fully free.',
    group: 'Marketing',
    appWide: true,
    public: true,
  },
  showFoundingStageCopy: {
    label: 'Founding-stage copy',
    description: 'Show honest founding-stage marketing copy instead of social-proof stats (property counts, ratings, testimonials). Switch off only when real usage backs those claims.',
    group: 'Marketing',
    appWide: true,
    public: false,
  },
  enableWhatsAppConcierge: {
    label: 'WhatsApp concierge listing',
    description: '"WhatsApp us 6 photos — we list it for you" CTAs across landlord surfaces. Requires NEXT_PUBLIC_WHATSAPP_SUPPORT to be set; CTAs hide themselves otherwise. Turn off if WhatsApp volume overwhelms ops.',
    group: 'Marketing',
    appWide: true,
    public: true,
  },
  enableQuickList: {
    label: '60-second quick-list form',
    description: 'The 6-field quick mode of the create-listing page (/dashboard/listings/new?mode=quick). Listings created are normal pending listings; ops enriches details during verification. Off hides the entry points and the quick/full toggle, and the page always opens in full mode.',
    group: 'Marketing',
    appWide: true,
    public: true,
  },
  enableWhatsAppIntake: {
    label: 'WhatsApp intake pipeline',
    description: 'Automated WhatsApp concierge: webhook receives listing submissions, the processing job parses and creates listings under Easy Rent Operations. Dormant until WHATSAPP_* env vars are set.',
    group: 'Platform',
    appWide: true,
    public: false,
  },
  autoPublishWhatsAppIntakes: {
    label: 'Auto-publish WhatsApp intakes',
    description:
      'Publish intake listings automatically once the automated approval checks pass (see "Automated listing approval"), with no human review — including for first-time landlords. OFF routes every intake to pending for one-tap approval instead.',
    group: 'Platform',
    appWide: true,
    public: false,
  },
  scrubUnverifiedContacts: {
    label: 'Remove unverified numbers from descriptions',
    description:
      "During automated moderation, strip phone numbers from a listing's description unless the owner has verified that number. The landlord is told in the same message that reports dropped photos. Deterministic — no model call. Off leaves descriptions exactly as the sender wrote them.",
    group: 'Platform',
    appWide: true,
    public: false,
  },
  enablePhoneVerification: {
    label: 'Self-service phone verification',
    description:
      'Lets landlords verify a contact number added on the website by sending a prefilled code from that number over WhatsApp — the same possession proof the intake pipeline already relies on. Requires the WhatsApp intake pipeline ON and NEXT_PUBLIC_WHATSAPP_SUPPORT set; the button hides itself otherwise. Turning this off stops new codes being issued but still honours codes already sitting in landlords’ chats.',
    group: 'Platform',
    appWide: true,
    public: true,
  },
  enableLlmParserFallback: {
    label: 'LLM parser fallback (intake)',
    description:
      'When the rule-based intake parser leaves required listing fields missing, ask a model for just those fields before replying to the sender — the rules always win where they found a value. Runs on the same SiliconFlow key as the moderation engine, and is a no-op without it. Off = deterministic rules only.',
    group: 'Platform',
    appWide: true,
    public: false,
  },
  enableWhatsAppLandlordAccounts: {
    label: 'WhatsApp landlord accounts',
    description:
      'Create a real landlord account for each WhatsApp sender and give them view/edit/delete links so they can manage their own listing. OFF keeps intake listings under the Easy Rent Operations identity with no self-service.',
    group: 'Platform',
    appWide: true,
    public: false,
  },
  enableWhatsAppRichReplies: {
    label: 'WhatsApp rich replies',
    description:
      'Blue-tick incoming messages, send an instant "got it" acknowledgment, use tappable buttons and list menus for the delete flow, and offer a share-location button when the address is missing. OFF keeps the plain-text conversation exactly as before.',
    group: 'Platform',
    appWide: true,
    public: false,
  },
  enableListingModeration: {
    label: 'Automated listing approval',
    description:
      'Run automated checks (language, title/description and location coherence, and image safety/text-overlay/person checks) before a listing goes live. Requires SILICONFLOW_API_KEY — a no-op without it. Off = listings publish exactly as they do today.',
    group: 'Platform',
    appWide: true,
    public: false,
  },
  moderateImages: {
    label: '— check images',
    description:
      'Sub-switch: run the per-image checks (unsafe content, text added over the photo, people visible). Off keeps the text checks only and spends nothing on vision.',
    group: 'Platform',
    appWide: true,
    public: false,
  },
  moderateTextCoherence: {
    label: '— check text coherence',
    description:
      'Sub-switch: verify the description matches the title and the location is consistent. Off keeps language and image checks only.',
    group: 'Platform',
    appWide: true,
    public: false,
  },
  holdOnUnsafeImages: {
    label: '— hold on unsafe images',
    description:
      'A photo flagged for nudity, violence or harassment holds the whole listing for a human instead of just dropping that photo. Cosmetic problems (added text, a person in frame) always just drop the photo.',
    group: 'Platform',
    appWide: true,
    public: false,
  },
  moderationFailOpen: {
    label: '— publish if checks unavailable',
    description:
      'EMERGENCY VALVE. When the moderation provider is unreachable, publish anyway instead of holding for review. Off (recommended) means nothing unchecked reaches the public site.',
    group: 'Platform',
    appWide: true,
    public: false,
  },
  maxPhotosPerListing: {
    label: 'Photos per listing',
    description:
      'The product cap AND the moderation cost ceiling — the same number by design. Enforced on every upload path; extra photos are refused or dropped with an explicit reason, never silently ignored. Needs "Photo limit" (Platform) switched on. Set below 1 for no limit.',
    group: 'Configuration',
    // public: the uploader reads it to show the right limit before submitting.
    appWide: false,
    public: true,
  },
  enforcePhotoCap: {
    // NOT "— …": the leading dash marks a sub-switch of the toggle above it, and
    // this one is independent of moderation — the cap is enforced on the web
    // uploader and the listing API with the automated checks switched off.
    label: 'Photo limit',
    description:
      'Enforce the per-listing photo cap set under Configuration → Photos per listing. Off means the limit is advisory: uploads are accepted and nothing is dropped for being over it.',
    group: 'Platform',
    appWide: true,
    public: true,
  },
  enableImageProcessing: {
    label: 'Compress + watermark images',
    description:
      'Re-encode listing photos (WebP, max 1920px, EXIF/GPS stripped) and apply the Easy Rent watermark. Photos from WhatsApp skip re-compression but are still watermarked.',
    group: 'Platform',
    appWide: true,
    public: false,
  },
  watermarkListingImages: {
    label: '— apply watermark',
    description: 'Sub-switch: compress without branding when off.',
    group: 'Platform',
    appWide: true,
    public: false,
  },
  listingExpirationDays: {
    label: 'Listing expiration (days)',
    description: 'Days after publishing before a listing expires.',
    group: 'Configuration',
    appWide: false,
    public: true,
  },
};

// Resolved snapshot: defaults merged with any DB overrides. Mutated only by
// `applyFeatureFlagOverrides` (called from the store). Starts as the defaults.
let resolved: Record<string, FeatureFlagValue> = { ...featureFlagDefaults };

/** Replace the active overrides. Called by the store after loading from the DB. */
export function applyFeatureFlagOverrides(
  overrides: Partial<Record<FeatureFlag, FeatureFlagValue>>
): void {
  resolved = { ...featureFlagDefaults, ...overrides };
}

/** The currently-resolved flag values (defaults + DB overrides). */
export function getResolvedFeatureFlags(): FeatureFlags {
  return { ...(resolved as FeatureFlags) };
}

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const value = resolved[flag];
  return typeof value === 'boolean' ? value : Boolean(value);
}

export function getFeatureValue<K extends FeatureFlag>(flag: K): FeatureFlags[K] {
  return resolved[flag] as FeatureFlags[K];
}

/** Only the flags marked safe to expose to the browser. */
export function getPublicFeatureFlags(): Partial<FeatureFlags> {
  const out: Record<string, FeatureFlagValue> = {};
  for (const key of Object.keys(featureFlagMeta) as FeatureFlag[]) {
    if (featureFlagMeta[key].public) out[key] = resolved[key];
  }
  return out as Partial<FeatureFlags>;
}
