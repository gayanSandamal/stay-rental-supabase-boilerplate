import { NextResponse, type NextRequest } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import {
  buildClientRedirect,
  pickAuthorizeParams,
  validateAuthorizeRequest,
} from '@/lib/mcp/oauth/authorize';
import { grantableScopes, originFromHeaders, parseScopes, type Scope } from '@/lib/mcp/oauth/config';
import { createAuthorizationCode } from '@/lib/mcp/oauth/store';

/**
 * POST /api/oauth/authorize — the user's decision on the consent screen.
 *
 * CSRF. This rides on the browser session, so it is the one OAuth endpoint a
 * hostile page could try to drive. Two independent defences: the request must
 * come from our own origin (Origin, or Referer when a browser omits Origin),
 * and Supabase's session cookies are SameSite=Lax, so a cross-site POST does
 * not carry them in the first place. Either alone would do.
 *
 * Every field is re-validated from scratch — the hidden inputs are only a
 * convenience for carrying the request through the form.
 *
 * /api is outside the middleware matcher, so the middleware's read-only
 * impersonation rule does not reach here; it is enforced explicitly below.
 */
export async function POST(request: NextRequest) {
  const origin = originFromHeaders(request.headers);
  const sentFrom = request.headers.get('origin') ?? refererOrigin(request.headers.get('referer'));
  if (sentFrom !== origin) {
    return new NextResponse('Cross-site request refused', { status: 403 });
  }

  await loadFeatureFlags();
  if (!isFeatureEnabled('enableMcpConnector')) {
    return NextResponse.redirect(new URL('/oauth/authorize', origin), 303);
  }

  const form = await request.formData();
  const params = pickAuthorizeParams((k) => {
    const v = form.get(k);
    return typeof v === 'string' ? v : null;
  });
  const result = await validateAuthorizeRequest(params, origin);

  if (result.kind === 'show_error') {
    // Back to the page, which renders the same error for the same input.
    const qs = new URLSearchParams(params as Record<string, string>);
    return NextResponse.redirect(new URL(`/oauth/authorize?${qs}`, origin), 303);
  }
  if (result.kind === 'redirect_error') {
    return NextResponse.redirect(
      buildClientRedirect(result.redirectUri, {
        error: result.error,
        error_description: result.description,
        state: result.state,
        iss: origin,
      }),
      303
    );
  }

  const user = await getUser();
  if (!user) {
    const qs = new URLSearchParams(params as Record<string, string>);
    return NextResponse.redirect(
      new URL(`/sign-in?redirect=${encodeURIComponent(`/oauth/authorize?${qs}`)}`, origin),
      303
    );
  }
  if (user.impersonatedBy) {
    return new NextResponse('Exit impersonation before connecting an app.', { status: 403 });
  }

  if (form.get('decision') !== 'approve') {
    return NextResponse.redirect(
      buildClientRedirect(result.redirectUri, {
        error: 'access_denied',
        error_description: 'The user declined to connect',
        state: result.state,
        iss: origin,
      }),
      303
    );
  }

  // What the user ticked, intersected with what this request and this role
  // may hold. A ticked box can only ever narrow.
  const offered = new Set(grantableScopes(result.requestedScopes, user.role));
  const ticked = parseScopes(form.getAll('grant_scope').filter((v): v is string => typeof v === 'string').join(' ')) ?? [];
  const scopes: Scope[] = ticked.filter((s) => offered.has(s));
  if (!scopes.includes('read') && offered.has('read')) scopes.unshift('read');
  if (scopes.length === 0) {
    return NextResponse.redirect(
      buildClientRedirect(result.redirectUri, {
        error: 'invalid_scope',
        error_description: 'No permissions were granted',
        state: result.state,
        iss: origin,
      }),
      303
    );
  }

  const code = await createAuthorizationCode({
    clientId: result.client.clientId,
    userId: user.id,
    redirectUri: result.redirectUri,
    codeChallenge: result.codeChallenge,
    scopes,
    resource: result.resource,
  });

  return NextResponse.redirect(
    buildClientRedirect(result.redirectUri, { code, state: result.state, iss: origin }),
    303
  );
}

function refererOrigin(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}
