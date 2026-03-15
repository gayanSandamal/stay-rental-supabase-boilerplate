/**
 * Landlord plan tier logic for Day One Monetization Strategy.
 * Free: 3, Basic: 5, Premium: 10, Agency: unlimited active listings.
 */

export type LandlordPlanTier = 'free' | 'basic' | 'premium' | 'agency';

export const LISTING_LIMITS: Record<LandlordPlanTier, number> = {
  free: 3,
  basic: 5,
  premium: 10,
  agency: 999999, // Unlimited
};

/** Plan tier weight for search ranking (higher = better placement) */
export const PLAN_TIER_WEIGHTS: Record<LandlordPlanTier, number> = {
  free: 0,
  basic: 1,
  premium: 2,
  agency: 3,
};

export type LandlordWithPlan = {
  id: number;
  landlordPlanTier?: string | null;
  landlordPlanExpiresAt?: Date | null;
};

export function getLandlordPlanTier(
  landlord: LandlordWithPlan | null | undefined
): LandlordPlanTier {
  if (!landlord) return 'free';
  const tier = (landlord.landlordPlanTier || 'free').toLowerCase() as LandlordPlanTier;
  if (!(tier in LISTING_LIMITS)) return 'free';
  // Check expiry
  if (landlord.landlordPlanExpiresAt && new Date(landlord.landlordPlanExpiresAt) < new Date()) {
    return 'free';
  }
  return tier;
}

export function getListingLimit(tier: LandlordPlanTier): number {
  return LISTING_LIMITS[tier] ?? 2;
}

export function getPlanTierWeight(tier: LandlordPlanTier): number {
  return PLAN_TIER_WEIGHTS[tier] ?? 0;
}

/** True for premium or agency tier (eligible for custom profile URL, etc.) */
export function isLandlordPremiumOrAbove(
  landlord: LandlordWithPlan | null | undefined
): boolean {
  const tier = getLandlordPlanTier(landlord);
  return tier === 'premium' || tier === 'agency';
}
