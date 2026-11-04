-- MCP CONNECTOR: Easy Rent as a remote MCP server (Claude custom connector).
--
-- The MCP endpoint (/mcp) is an OAuth 2.1 protected resource and this app is
-- its own authorization server: a connector registers itself (RFC 7591 dynamic
-- client registration), the user approves it on /oauth/authorize while signed
-- in with their normal Easy Rent session, and the connector receives a bearer
-- token that acts as that user — with that user's role, and nothing more.
--
-- Every secret is stored as sha256 only (same rule as landlord_access_tokens):
-- client secrets, authorization codes, access tokens and refresh tokens. A
-- database leak must not hand anyone a working token.
--
-- Safe to replay: additive DDL only, every statement IF NOT EXISTS, no DO block
-- (splitStatements mis-parses `END $$;` and swallows the rest of the file).

-- 1. Registered clients. Registration is open (that is what DCR means), so
-- nothing here is trusted: client_name is attacker-controlled and the consent
-- screen leads with the redirect host instead.
CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
  id serial PRIMARY KEY,
  client_id text NOT NULL UNIQUE,
  -- NULL for public clients (token_endpoint_auth_method = 'none').
  client_secret_hash text,
  client_name text,
  client_uri text,
  -- JSON array of exact-match redirect URIs.
  redirect_uris text NOT NULL,
  token_endpoint_auth_method text NOT NULL DEFAULT 'none',
  created_at timestamp NOT NULL DEFAULT now(),
  last_used_at timestamp
);

-- 2. One row per user authorisation of a client. Refresh ROTATES the token
-- hashes in place; previous_refresh_token_hash is what detects a replayed
-- (stolen) refresh token, which revokes the whole grant.
CREATE TABLE IF NOT EXISTS mcp_oauth_grants (
  id serial PRIMARY KEY,
  client_id text NOT NULL REFERENCES mcp_oauth_clients(client_id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Space-separated: read | write | admin.
  scope text NOT NULL,
  -- RFC 8707 resource indicator the token is bound to (the /mcp URL).
  resource text NOT NULL,
  access_token_hash text NOT NULL UNIQUE,
  access_expires_at timestamp NOT NULL,
  refresh_token_hash text NOT NULL UNIQUE,
  previous_refresh_token_hash text,
  refresh_expires_at timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  last_used_at timestamp,
  revoked_at timestamp
);

CREATE INDEX IF NOT EXISTS mcp_oauth_grants_user_idx ON mcp_oauth_grants (user_id);
CREATE INDEX IF NOT EXISTS mcp_oauth_grants_prev_refresh_idx
  ON mcp_oauth_grants (previous_refresh_token_hash)
  WHERE previous_refresh_token_hash IS NOT NULL;

-- 3. Authorization codes. Single use, minutes long. grant_id is filled when the
-- code is exchanged, so a replayed code can revoke the tokens it produced
-- (OAuth 2.1 §4.1.3).
CREATE TABLE IF NOT EXISTS mcp_oauth_codes (
  id serial PRIMARY KEY,
  code_hash text NOT NULL UNIQUE,
  client_id text NOT NULL REFERENCES mcp_oauth_clients(client_id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  scope text NOT NULL,
  resource text NOT NULL,
  expires_at timestamp NOT NULL,
  consumed_at timestamp,
  grant_id integer REFERENCES mcp_oauth_grants(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

-- 4. Audit trail for the two consequential moments.
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'mcp_connector_authorized';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'mcp_connector_revoked';
