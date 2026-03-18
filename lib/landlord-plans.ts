/**
 * Landlord plan tier logic for Reimagined Free Listing + Paid Visibility.
 * All plans allow unlimited active listings; monetization is via visibility (Boost, Featured, Urgent).
 */

export type LandlordPlanTier = 'free' | 'starter' | 'pro' | 'agency' | 'basic' | 'premium';

export const LISTING_LIMITS: Record<LandlordPlanTier, number> = {
  free: 999999,
  starter: 999999,
  pro: 999999,
  agency: 999999,
  basic: 999999, // legacy, maps to starter
  premium: 999999, // legacy, maps to pro
};

/** Plan tier weight for search ranking (higher = better placement) */
export const PLAN_TIER_WEIGHTS: Record<LandlordPlanTier, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  agency: 3,
  basic: 1,
  premium: 2,
};

/** Included Boosts per calendar month for paid plans */
export const INCLUDED_BOOSTS_PER_MONTH: Record<LandlordPlanTier, number> = {
  free: 0,
  starter: 1,
  pro: 3,
  agency: 6,
  basic: 1,
  premium: 3,
};

export type LandlordWithPlan = {
  id: number;
  landlordPlanTier?: string | null;
  landlordPlanExpiresAt?: Date | null;
  boostsUsedThisMonth?: number | null;
  boostsMonthResetAt?: Date | string | null;
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

/** Returns number of included Boosts remaining this month. Resets at month boundary. */
export function getIncludedBoostsRemaining(
  landlord: LandlordWithPlan | null | undefined
): number {
  if (!landlord) return 0;
  const tier = getLandlordPlanTier(landlord);
  const allowance = INCLUDED_BOOSTS_PER_MONTH[tier] ?? 0;
  if (allowance === 0) return 0;

  const now = new Date();
  const resetAt = landlord.boostsMonthResetAt
    ? new Date(landlord.boostsMonthResetAt)
    : null;
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  let used = landlord.boostsUsedThisMonth ?? 0;
  if (!resetAt || resetAt < startOfThisMonth) {
    used = 0;
  }

  return Math.max(0, allowance - used);
}

/** True for pro, premium, or agency tier (eligible for custom profile URL, etc.) */
export function isLandlordPremiumOrAbove(
  landlord: LandlordWithPlan | null | undefined
): boolean {
  const tier = getLandlordPlanTier(landlord);
  return tier === 'pro' || tier === 'premium' || tier === 'agency';
}
