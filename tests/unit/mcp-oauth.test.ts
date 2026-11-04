import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCOPES,
  TOKEN_PREFIX,
  grantableScopes,
  isAcceptableRedirectUri,
  isValidCodeChallenge,
  originFromHeaders,
  parseScopes,
  randomToken,
  redirectDisplayHost,
  redirectUriMatches,
  resourceFor,
  resourceMatches,
  sha256Hex,
  verifyPkce,
} from '@/lib/mcp/oauth/config';
import { authorizationServerMetadata, protectedResourceMetadata } from '@/lib/mcp/oauth/metadata';

const challengeFor = (verifier: string) => crypto.createHash('sha256').update(verifier).digest('base64url');

describe('PKCE (S256 only)', () => {
  it('accepts a freshly generated pair and rejects any other verifier', () => {
    const verifier = crypto.randomBytes(48).toString('base64url');
    const challenge = challengeFor(verifier);
    expect(isValidCodeChallenge(challenge)).toBe(true);
    expect(verifyPkce(verifier, challenge)).toBe(true);
    expect(verifyPkce(crypto.randomBytes(48).toString('base64url'), challenge)).toBe(false);
  });

  it('refuses malformed verifiers rather than hashing them', () => {
    const challenge = challengeFor('a'.repeat(43));
    expect(verifyPkce('a'.repeat(42), challengeFor('a'.repeat(42)))).toBe(false); // too short
    expect(verifyPkce('a'.repeat(129), challengeFor('a'.repeat(129)))).toBe(false); // too long
    expect(verifyPkce('a'.repeat(42) + '!', challenge)).toBe(false); // outside the unreserved set
    expect(verifyPkce(null, challenge)).toBe(false);
    expect(verifyPkce(undefined, challenge)).toBe(false);
  });

  it('only accepts 43-char base64url challenges (what S256 produces)', () => {
    expect(isValidCodeChallenge('plain-text-challenge')).toBe(false);
    expect(isValidCodeChallenge(undefined)).toBe(false);
    expect(isValidCodeChallenge('x'.repeat(43))).toBe(true);
  });
});

describe('redirect URI registration', () => {
  it.each([
    'https://claude.ai/api/mcp/auth_callback',
    'https://claude.com/api/mcp/auth_callback',
    'http://localhost:33418/callback',
    'http://127.0.0.1:6274/oauth/callback',
    'cursor://anysphere.cursor-retrieval/oauth/user-easyrent/callback',
  ])('accepts %s', (uri) => {
    expect(isAcceptableRedirectUri(uri)).toBe(true);
  });

  it.each([
    'http://claude.ai/callback', // plain http off-loopback
    'http://localhost.evil.com/cb',
    'https://claude.ai/cb#frag',
    'https://user:pass@claude.ai/cb',
    'javascript:alert(1)',
    'data:text/html,hi',
    'file:///etc/passwd',
    'not a url',
    '',
    42,
  ])('refuses %s', (uri) => {
    expect(isAcceptableRedirectUri(uri)).toBe(false);
  });
});

describe('redirect URI matching', () => {
  const registered = ['https://claude.ai/api/mcp/auth_callback', 'http://127.0.0.1:5000/cb'];

  it('is an exact match for https', () => {
    expect(redirectUriMatches('https://claude.ai/api/mcp/auth_callback', registered)).toBe(true);
    expect(redirectUriMatches('https://claude.ai/api/mcp/auth_callback/', registered)).toBe(false);
    expect(redirectUriMatches('https://claude.ai/api/mcp/auth_callback?x=1', registered)).toBe(false);
    expect(redirectUriMatches('https://evil.ai/api/mcp/auth_callback', registered)).toBe(false);
  });

  it('lets a loopback redirect change PORT only (RFC 8252 §7.3)', () => {
    expect(redirectUriMatches('http://127.0.0.1:61234/cb', registered)).toBe(true);
    expect(redirectUriMatches('http://127.0.0.1:61234/other', registered)).toBe(false);
    expect(redirectUriMatches('http://localhost:5000/cb', registered)).toBe(false); // host must match
  });

  it('shows the redirect host — the one client fact we can trust', () => {
    expect(redirectDisplayHost('https://claude.ai/api/mcp/auth_callback')).toBe('claude.ai');
    expect(redirectDisplayHost('http://127.0.0.1:5000/cb')).toBe('127.0.0.1:5000');
  });
});

describe('scopes', () => {
  it('parses known scopes in canonical order and drops unknown ones', () => {
    expect(parseScopes('write read openid')).toEqual(['read', 'write']);
    expect(parseScopes('')).toBeNull();
    expect(parseScopes(undefined)).toBeNull();
    expect(parseScopes('openid profile')).toEqual([]);
  });

  it('never offers admin to a renter or landlord, even when asked', () => {
    expect(grantableScopes(['read', 'write', 'admin'], 'tenant')).toEqual(['read', 'write']);
    expect(grantableScopes(['read', 'admin'], 'landlord')).toEqual(['read']);
    expect(grantableScopes(null, 'landlord')).toEqual(DEFAULT_SCOPES);
  });

  it('offers admin to staff, by default when nothing was asked', () => {
    expect(grantableScopes(null, 'ops')).toEqual(['read', 'write', 'admin']);
    expect(grantableScopes(['read'], 'admin')).toEqual(['read']);
  });
});

describe('resource indicators (RFC 8707)', () => {
  const origin = 'https://easyrent.lk';
  it('accepts our MCP URL, the origin, or nothing', () => {
    expect(resourceMatches(undefined, origin)).toBe(true);
    expect(resourceMatches('https://easyrent.lk/mcp', origin)).toBe(true);
    expect(resourceMatches('https://easyrent.lk/mcp/', origin)).toBe(true);
    expect(resourceMatches('https://easyrent.lk', origin)).toBe(true);
  });
  it('refuses any other resource', () => {
    expect(resourceMatches('https://evil.example/mcp', origin)).toBe(false);
    expect(resourceMatches('https://easyrent.lk/api', origin)).toBe(false);
  });
});

describe('origin and metadata', () => {
  it('derives the origin from forwarded headers', () => {
    const h = new Headers({ host: 'internal', 'x-forwarded-host': 'easyrent.lk', 'x-forwarded-proto': 'https' });
    expect(originFromHeaders(h)).toBe('https://easyrent.lk');
    expect(originFromHeaders(new Headers({ host: 'localhost:3000' }))).toBe('http://localhost:3000');
  });

  it('advertises a consistent authorization server and protected resource', () => {
    const origin = 'https://easyrent.lk';
    const as = authorizationServerMetadata(origin);
    const pr = protectedResourceMetadata(origin);
    expect(as.issuer).toBe(origin);
    expect(pr.authorization_servers).toEqual([origin]);
    expect(pr.resource).toBe(resourceFor(origin));
    expect(as.code_challenge_methods_supported).toEqual(['S256']);
    expect(as.grant_types_supported).not.toContain('implicit');
    expect(as.response_types_supported).toEqual(['code']);
    for (const url of [as.authorization_endpoint, as.token_endpoint, as.registration_endpoint, as.revocation_endpoint]) {
      expect(url.startsWith(origin)).toBe(true);
    }
  });
});

describe('tokens', () => {
  it('are prefixed, high-entropy and stored as sha256', () => {
    const t = randomToken(TOKEN_PREFIX.access);
    expect(t.startsWith('er_at_')).toBe(true);
    expect(t.length).toBeGreaterThanOrEqual(6 + 43);
    expect(randomToken(TOKEN_PREFIX.access)).not.toBe(t);
    expect(sha256Hex(t)).toMatch(/^[0-9a-f]{64}$/);
  });
});
