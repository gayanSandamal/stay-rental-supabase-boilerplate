import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { banUser, unbanUser, UserLifecycleError } from '@/lib/admin/user-lifecycle';

/**
 * Ban or unban an account. Admin only.
 *
 * The role gate is here AND in the library. Duplicated on purpose: a guard that
 * lives only at the transport layer is one refactor away from being bypassed by
 * a new caller.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getUser();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (actor.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // An impersonating session is read-only; middleware already refuses this, and
  // this is the second lock on the same door.
  if (actor.impersonatedBy) {
    return NextResponse.json({ error: 'Read-only while impersonating' }, { status: 403 });
  }

  const userId = Number((await params).id);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  let body: { action?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  try {
    if (body.action === 'unban') {
      await unbanUser({ actorId: actor.id, userId });
      return NextResponse.json({ ok: true, banned: false });
    }
    const result = await banUser({
      actorId: actor.id,
      userId,
      reason: body.reason ?? '',
    });
    return NextResponse.json({ ok: true, banned: true, ...result });
  } catch (err) {
    if (err instanceof UserLifecycleError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error('[api/admin/users/ban]', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
