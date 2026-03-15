import type { User } from '@/lib/db/schema';

type UserSubscriptionFields = Pick<User, 'subscriptionTier' | 'subscriptionExpiresAt'>;

export function isUserPremium(user: User | UserSubscriptionFields | null | undefined): boolean {
  if (!user) return false;
  if (user.subscriptionTier !== 'premium') return false;
  if (user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) < new Date()) {
    return false;
  }
  return true;
}
