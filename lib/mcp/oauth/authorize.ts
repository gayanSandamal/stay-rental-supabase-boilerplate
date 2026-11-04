import 'server-only';
import type { McpOauthClient } from '@/lib/db/schema';
import {
  isValidCodeChallenge,
  parseScopes,
  resourceFor,
  resourceMatches,
  redirectUriMatches,
  type Scope,
} from './config';
import { clientRedirectUris, getClient } from './store';

/**
 * Validation for /oauth/authorize, shared by the consent page (GET) and the
 * decision handler (POST) — the POST re-runs it on the hidden form fields
 * rather than trusting anything the page rendered.
 *
 * The ORDER of checks is the security property. Until client_id and
 * redirect_uri are both verified, an error must be SHOWN, never redirected:
 * redirecting to an unverified URI is the open-redirect hole the spec warns
 * about (RFC 6749 §4.1.2.1). After that, errors go back to the client.
 */
export interface AuthorizeParams {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  scope?: string;
  resource?: string;
}

export type AuthorizeValidation =
  | { kind: 'show_error'; message: string }
  | { kind: 'redirect_error'; redirectUri: string; error: string; description: string; state?: string }
  | {
      kind: 'ok';
      client: McpOauthClient;
      redirectUri: string;
      state?: string;
      codeChallenge: string;
      requestedScopes: Scope[] | null;
      resource: string;
    };

export const AUTHORIZE_PARAM_KEYS: (keyof AuthorizeParams)[] = [
  'response_type',
  'client_id',
  'redirect_uri',
  'state',
  'code_challenge',
  'code_challenge_method',
  'scope',
  'resource',
];

export function pickAuthorizeParams(get: (key: string) => string | null | undefined): AuthorizeParams {
  const out: AuthorizeParams = {};
  for (const key of AUTHORIZE_PARAM_KEYS) {
    const v = get(key);
    if (typeof v === 'string' && v.length <= 2000) out[key] = v;
  }
  return out;
}

export async function validateAuthorizeRequest(
  p: AuthorizeParams,
  origin: string
): Promise<AuthorizeValidation> {
  const client = await getClient(p.client_id);
  if (!client) {
    return { kind: 'show_error', message: 'This app is not registered with Easy Rent. Try connecting again from the app.' };
  }

  const registered = clientRedirectUris(client);
  let redirectUri = p.redirect_uri;
  if (!redirectUri && registered.length === 1) redirectUri = registered[0];
  if (!redirectUri || !redirectUriMatches(redirectUri, registered)) {
    return { kind: 'show_error', message: 'The app sent an invalid return address, so we stopped here to keep your account safe.' };
  }

  const state = p.state && p.state.length <= 1000 ? p.state : undefined;
  const fail = (error: string, description: string): AuthorizeValidation => ({
    kind: 'redirect_error',
    redirectUri: redirectUri!,
    error,
    description,
    state,
  });

  if (p.response_type !== 'code') return fail('unsupported_response_type', 'Only response_type=code is supported');
  if (p.code_challenge_method !== 'S256' || !isValidCodeChallenge(p.code_challenge)) {
    return fail('invalid_request', 'PKCE with code_challenge_method=S256 is required');
  }
  if (!resourceMatches(p.resource, origin)) {
    return fail('invalid_target', `This server only issues tokens for ${resourceFor(origin)}`);
  }

  const requestedScopes = parseScopes(p.scope);
  if (requestedScopes && requestedScopes.length === 0) {
    return fail('invalid_scope', 'None of the requested scopes are supported (read, write, admin)');
  }

  return {
    kind: 'ok',
    client,
    redirectUri,
    state,
    codeChallenge: p.code_challenge!,
    requestedScopes,
    resource: resourceFor(origin),
  };
}

/** Append OAuth response params to a redirect URI, keeping any query it already has. */
export function buildClientRedirect(redirectUri: string, params: Record<string, string | undefined>): string {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, v);
  }
  return url.toString();
}
