import { describe, expect, it } from 'vitest';
import { hashToken } from '@/lib/auth/access-links';
import { isReservedWaEmail, syntheticEmailFor, WA_EMAIL_DOMAIN } from '@/lib/intake/landlord-identity';
import { publisherDisplayName } from '@/lib/publisher-name';

describe('syntheticEmailFor', () => {
  it('is deterministic — a retry after a partial failure recovers the same account', () => {
    expect(syntheticEmailFor('+94770711939')).toBe(syntheticEmailFor('+94770711939'));
  });

  it('differs per number and reveals no digits of the phone', () => {
    const a = syntheticEmailFor('+94770711939');
    const b = syntheticEmailFor('+94752953202');
    expect(a).not.toBe(b);
    expect(a).not.toContain('94770711939');
    expect(a).toMatch(new RegExp(`^wa-[0-9a-f]{16}@${WA_EMAIL_DOMAIN}$`));
  });

  it('fits the users.email column (varchar 255)', () => {
    expect(syntheticEmailFor('+94770711939').length).toBeLessThanOrEqual(255);
  });
});

describe('isReservedWaEmail', () => {
  it('recognises our placeholder domain, case-insensitively', () => {
    expect(isReservedWaEmail(syntheticEmailFor('+94770711939'))).toBe(true);
    expect(isReservedWaEmail(`WA-ABC123@${WA_EMAIL_DOMAIN.toUpperCase()}`)).toBe(true);
  });

  it('leaves real addresses alone', () => {
    for (const e of ['gayan@easyrent.lk', 'someone@gmail.com', 'a@wa.easyrent.lk.evil.com', null, undefined, '']) {
      expect(isReservedWaEmail(e as string)).toBe(false);
    }
  });
});

describe('hashToken', () => {
  it('is a stable sha256 hex digest', () => {
    const h = hashToken('abc');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken('abc')).toBe(h);
    expect(hashToken('abd')).not.toBe(h);
  });

  it('never returns the token itself — only the hash is stored', () => {
    const token = 'super-secret-token-value';
    expect(hashToken(token)).not.toContain(token);
  });
});

describe('publisherDisplayName', () => {
  it('prefers the landlord name', () => {
    expect(publisherDisplayName({ name: 'Gayan Sandamal', email: 'g@x.com' })).toBe('Gayan Sandamal');
  });

  it('never leaks a synthetic address — the phone-shaped identifier', () => {
    const email = syntheticEmailFor('+94770711939');
    expect(publisherDisplayName({ name: null, email })).toBe('Property owner');
    expect(publisherDisplayName({ name: '   ', email })).toBe('Property owner');
  });

  it('falls back to a real email (unchanged existing behaviour)', () => {
    expect(publisherDisplayName({ name: null, email: 'landlord@gmail.com' })).toBe('landlord@gmail.com');
  });

  it('has a safe last resort', () => {
    expect(publisherDisplayName({})).toBe('Property owner');
    expect(publisherDisplayName({ name: null, email: null })).toBe('Property owner');
  });
});
