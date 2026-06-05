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
