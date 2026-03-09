export const featureFlags = {
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
  listingExpirationDays: 30,
} as const;

export type FeatureFlag = keyof typeof featureFlags;

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const value = featureFlags[flag];
  return typeof value === 'boolean' ? value : Boolean(value);
}

export function getFeatureValue<K extends FeatureFlag>(flag: K): (typeof featureFlags)[K] {
  return featureFlags[flag];
}
