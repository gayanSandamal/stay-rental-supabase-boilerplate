import type { User } from '@/lib/db/schema';
import { isFeatureEnabled } from '@/lib/feature-flags';

type UserSubscriptionFields = Pick<User, 'subscriptionTier' | 'subscriptionExpiresAt'>;

export function isUserPremium(user: User | UserSubscriptionFields | null | undefined): boolean {
  if (!user) return false;
  if (user.subscriptionTier !== 'premium') return false;
  if (user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) < new Date()) {
    return false;
  }
  return true;
}

/**
 * Hours to hide brand-new listings from this user (Premium early access).
 * Early access is a paid perk: while paid visibility (`enablePricingSection`)
 * is OFF nobody can buy Premium, so no visitor should be delayed — otherwise
 * every new listing is invisible to the whole marketplace for 24h.
 */
export function newListingHideHours(
  user: User | UserSubscriptionFields | null | undefined
): number | undefined {
  if (!isFeatureEnabled('enablePricingSection')) return undefined;
  return isUserPremium(user) ? undefined : 24;
}
