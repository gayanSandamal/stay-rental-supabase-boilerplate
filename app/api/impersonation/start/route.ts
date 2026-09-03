import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import {
  IMPERSONATION_COOKIE,
  IMPERSONATION_TTL_MS,
  startImpersonation,
} from '@/lib/auth/impersonation';
import { getClientIp } from '@/lib/rate-limit';

/**
 * Begin impersonating a user. Admin only; tenants and landlords only.
 *
 * Both rules are enforced in `startImpersonation`, not here — this route is a
 * thin transport so the rules cannot be bypassed by reaching the library from
 * anywhere else.
 */
export async function POST(request: NextRequest) {
  const actor = await getUser();
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  /*
   * Ops are deliberately excluded, even though they can read this back office.
   * Assuming another person's identity is a different order of privilege from
   * reading a list of them, and folding the two together would erase the
   * ops/admin distinction.
   */
  if (actor.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // An impersonating session must not be able to open another one. Nesting
  // would make "who is really acting" unanswerable, which is the one question
  // this feature has to keep answerable.
  if (actor.impersonatedBy) {
    return NextResponse.json(
      { error: 'Already impersonating. Exit first.' },
      { status: 409 }
    );
  }

  let subjectUserId: number;
  try {
    const body = await request.json();
    subjectUserId = Number(body?.userId);
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  if (!Number.isSafeInteger(subjectUserId) || subjectUserId <= 0) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  let token: string;
  let expiresAt: Date;
  try {
    const result = await startImpersonation({
      actor: { id: actor.id, role: actor.role },
      subjectUserId,
      actorIp: getClientIp(request),
    });
    token = result.token;
    expiresAt = result.expiresAt;
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message.replace(/^impersonation: /, '') },
      { status: 400 }
    );
  }

  const response = NextResponse.json({ ok: true, expiresAt });
  response.cookies.set(IMPERSONATION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // Mirrors the server-side expiry. The server is the authority — a browser
    // that ignores this still gets nothing, because the row has expired too.
    maxAge: Math.floor(IMPERSONATION_TTL_MS / 1000),
  });
  return response;
}
