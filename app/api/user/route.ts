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

    const user = await db
      .select()
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
