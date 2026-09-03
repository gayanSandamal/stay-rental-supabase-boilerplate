import { getUser } from '@/lib/db/queries';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const email = searchParams.get('email');

  // If email is provided, search for that user (for back office)
  if (email) {
    const currentUser = await getUser();
    // Only admins and ops can search for users
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'ops')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    /*
     * An EXPLICIT column list, not `select()`.
     *
     * This returned the whole row straight to the browser, which meant shipping
     * `password_hash` and `auth_user_id` on every lookup. It is admin/ops-gated
     * so it was never a public leak, and password_hash is legacy now that
     * Supabase Auth owns sign-in — but a credential hash and the auth primary
     * key have no reason to cross the wire, and `getUser()` is careful about
     * exactly this.
     */
    const user = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        phone: users.phone,
        waPhone: users.waPhone,
        preferredLanguage: users.preferredLanguage,
        subscriptionTier: users.subscriptionTier,
        subscriptionExpiresAt: users.subscriptionExpiresAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);

    if (user.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ user: user[0] });
  }

  // Otherwise, return current user
  const user = await getUser();
  return Response.json(user);
}
