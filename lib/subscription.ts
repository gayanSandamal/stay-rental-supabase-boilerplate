import type { User } from '@/lib/db/schema';

export function isUserPremium(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.subscriptionTier !== 'premium') return false;
  if (user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) < new Date()) {
    return false;
  }
  return true;
}
