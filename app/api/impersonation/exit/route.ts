import { NextRequest, NextResponse } from 'next/server';
import { IMPERSONATION_COOKIE, endImpersonation } from '@/lib/auth/impersonation';

/**
 * End impersonation and return to the admin's own session.
 *
 * Exempted from the read-only rule in middleware — it is the way out, so
 * blocking it would leave deleting a cookie by hand as the only escape.
 *
 * Deliberately requires no role check and never fails loudly: the cookie itself
 * is the credential, ending a session is not a privileged act, and anything
 * that makes exiting harder than entering is a trap.
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(IMPERSONATION_COOKIE)?.value;
  await endImpersonation(token);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(IMPERSONATION_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
