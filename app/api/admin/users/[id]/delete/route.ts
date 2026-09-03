import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { hardDeleteUser, UserLifecycleError } from '@/lib/admin/user-lifecycle';

/**
 * PERMANENTLY erase an account. Admin only. There is no undo.
 *
 * Uses DELETE rather than POST so the method itself says what happens — and so
 * that a mis-wired form or a prefetch, which are GET or POST, cannot reach it.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getUser();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (actor.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (actor.impersonatedBy) {
    return NextResponse.json({ error: 'Read-only while impersonating' }, { status: 403 });
  }

  const userId = Number((await params).id);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  /*
   * The caller must name the account it believes it is deleting, and the server
   * checks that against the row. A stale list — an operator acting on a page
   * rendered before someone else changed something — would otherwise delete
   * whoever now occupies that id. For an irreversible action, "the id I clicked"
   * is not a strong enough statement of intent.
   */
  let body: { confirmEmail?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  try {
    const result = await hardDeleteUser({
      actorId: actor.id,
      userId,
      confirmEmail: body.confirmEmail ?? '',
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof UserLifecycleError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error('[api/admin/users/delete]', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
