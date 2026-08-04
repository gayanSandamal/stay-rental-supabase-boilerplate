import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { businessAccountMembers } from '@/lib/db/schema';
import { getUserWithLandlord } from '@/lib/db/queries';
import type { User } from '@/lib/db/schema';

/**
 * Can this user edit/remove this listing?
 *
 * Extracted from the edit page so the delete page can't drift from it — the two
 * must agree, or a link that opens the edit form would 404 on delete (or worse,
 * the reverse).
 */
export async function canManageListing(
  user: Pick<User, 'id' | 'role'>,
  listing: { landlordId: number; businessAccountId: number | null; createdBy: number | null }
): Promise<boolean> {
  if (user.role === 'admin' || user.role === 'ops') return true;

  const userWithLandlord = await getUserWithLandlord(user.id);
  if (userWithLandlord?.landlord && userWithLandlord.landlord.id === listing.landlordId) {
    return true;
  }

  try {
    const member = await db.query.businessAccountMembers.findFirst({
      where: and(
        eq(businessAccountMembers.userId, user.id),
        eq(businessAccountMembers.isActive, true)
      ),
    });
    if (member && listing.businessAccountId === member.businessAccountId) return true;
  } catch {
    // Fall through to the createdBy check if the columns aren't there.
  }

  return listing.createdBy === user.id;
}
