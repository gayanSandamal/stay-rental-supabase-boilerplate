import { SCOPES, resourceFor } from './config';

/**
 * RFC 8414 authorization server metadata. Issuer is the bare origin, so it is
 * served at /.well-known/oauth-authorization-server with no path suffix.
 */
export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    revocation_endpoint: `${origin}/api/oauth/revoke`,
    scopes_supported: [...SCOPES],
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    code_challenge_methods_supported: ['S256'],
    // RFC 9207: the redirect carries `iss`, so a client talking to several
    // servers can tell whose code it holds (mix-up attack defence).
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${origin}/how-to-use`,
  };
}

/** RFC 9728 protected resource metadata for /mcp. */
export function protectedResourceMetadata(origin: string) {
  return {
    resource: resourceFor(origin),
    authorization_servers: [origin],
    scopes_supported: [...SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: 'Easy Rent',
    resource_documentation: `${origin}/how-to-use`,
  };
}
