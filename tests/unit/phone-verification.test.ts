/**
 * Contact-number verification (lib/auth/phone-verification.ts).
 *
 * The load-bearing property here is easy to refactor away by accident: the code
 * in the message is only a CORRELATION token, and possession is proven solely by
 * the channel adapter's sender number. Anyone who "simplifies" redeem to trust a
 * matching code alone turns this into a self-service badge for any number a
 * landlord can type. The wrong-sender cases below exist to fail loudly then.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  challenge: null as any,
  writes: [] as Array<{ table: string; values: Record<string, unknown> }>,
  audits: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/db/drizzle', () => {
  // Drizzle's update chain: .set().where() is awaitable, and sometimes also
  // carries .returning(). Both shapes are used by redeem.
  const update = (table: any) => ({
    set: (values: Record<string, unknown>) => ({
      where: () => {
        state.writes.push({ table: table?.[Symbol.for('drizzle:Name')] ?? 'unknown', values });
        const row = [{ id: 1, phoneNumber: '+94771234567' }];
        const p: any = Promise.resolve(row);
        p.returning = async () => row;
        return p;
      },
    }),
  });
  return {
    db: {
      query: { phoneVerifications: { findFirst: async () => state.challenge } },
      update,
    },
  };
});

vi.mock('@/lib/db/audit-logger', () => ({
  logAudit: async (p: Record<string, unknown>) => {
    state.audits.push(p);
  },
}));

vi.mock('@/lib/intake/ops-identity', () => ({
  getOrCreateOpsIdentity: async () => ({ userId: 42, landlordId: 7, businessAccountId: 3 }),
}));

import {
  MAX_VERIFICATION_ATTEMPTS,
  VERIFY_PREFIX,
  buildVerifyLink,
  extractVerificationCode,
  generateCode,
  hashCode,
  normalizePhone,
  redeemPhoneVerification,
} from '@/lib/auth/phone-verification';

const OWNER = '+94771234567';

/** A live, unspent challenge for OWNER unless overridden. */
const challengeFor = (over: Record<string, unknown> = {}) => ({
  id: 1,
  contactNumberId: 10,
  userId: 5,
  codeHash: hashCode('ABC234'),
  expectedPhone: OWNER,
  channel: 'whatsapp',
  expiresAt: new Date(Date.now() + 60_000),
  attempts: 0,
  consumedAt: null,
  ...over,
});

/** Did we write verified:true onto a contact number? The only thing that matters. */
const verifiedWrites = () =>
  state.writes.filter((w) => w.values.verified === true);

beforeEach(() => {
  state.challenge = null;
  state.writes = [];
  state.audits = [];
});

describe('normalizePhone', () => {
  it('folds every shape a landlord types onto the webhook form', () => {
    // Both sides of the possession comparison run through this. If any of these
    // stop agreeing, real landlords silently cannot verify.
    for (const typed of [
      '0771234567',
      '077 123 4567',
      '077-123-4567',
      '+94771234567',
      '+94 77 123 4567',
      '94771234567', // exactly what Meta hands the webhook
      '771234567',
      '0094771234567',
    ]) {
      expect(normalizePhone(typed)).toBe(OWNER);
    }
  });

  it('keeps distinct numbers distinct', () => {
    expect(normalizePhone('0771234567')).not.toBe(normalizePhone('0777654321'));
  });

  it('refuses to guess rather than risk matching the wrong number', () => {
    for (const junk of ['', '   ', 'not a phone', '1234', '12345678', null, undefined]) {
      expect(normalizePhone(junk as string)).toBeNull();
    }
  });

  it('accepts a foreign number only when the author wrote the +', () => {
    expect(normalizePhone('+14155552671')).toBe('+14155552671');
    // Without the +, an unfamiliar length is indistinguishable from a typo.
    expect(normalizePhone('14155552671')).toBeNull();
  });
});

describe('code format', () => {
  it('avoids characters that are misread when retyped', () => {
    const sample = Array.from({ length: 300 }, () => generateCode()).join('');
    expect(sample).not.toMatch(/[01OILU]/);
    expect(generateCode()).toHaveLength(6);
  });

  it('extracts the code from a real prefilled message, however it is cased', () => {
    expect(extractVerificationCode(`${VERIFY_PREFIX}-ABC234`)).toBe('ABC234');
    expect(extractVerificationCode(`hi ${VERIFY_PREFIX}-ABC234 thanks`)).toBe('ABC234');
    expect(extractVerificationCode(`${VERIFY_PREFIX.toLowerCase()}-abc234`)).toBe('ABC234');
  });

  it('does not fire on listing text or commands — it runs BEFORE the intake append', () => {
    // A false positive here would swallow a genuine property submission.
    for (const text of [
      '3BR house in Nugegoda, 85000 per month, call me',
      'DELETE',
      'LINK',
      'verify my number please',
      '',
      null,
    ]) {
      expect(extractVerificationCode(text as string)).toBeNull();
    }
  });

  it('stores only a hash — the plaintext code is never at rest', () => {
    const code = generateCode();
    const h = hashCode(code);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(code);
    expect(hashCode(code.toLowerCase())).toBe(h); // case-insensitive by design
  });

  it('builds a wa.me deep link carrying the prefixed code', () => {
    // Read at call time from the env, so the test supplies its own number
    // rather than depending on whatever the developer has in .env.
    const prev = process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT;
    process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT = '94770711939';
    try {
      const link = buildVerifyLink('ABC234');
      expect(link).toContain('https://wa.me/94770711939');
      expect(decodeURIComponent(link!)).toContain(`${VERIFY_PREFIX}-ABC234`);
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT;
      else process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT = prev;
    }
  });

  it('returns no link when no support number is configured', () => {
    // The button hides itself rather than sending landlords nowhere — the same
    // contract the concierge CTAs follow.
    const prev = process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT;
    delete process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT;
    try {
      expect(buildVerifyLink('ABC234')).toBeNull();
    } finally {
      if (prev !== undefined) process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT = prev;
    }
  });
});

describe('redeemPhoneVerification — possession, not the code, is the proof', () => {
  it('REFUSES a valid code sent from a different number', async () => {
    state.challenge = challengeFor();
    const r = await redeemPhoneVerification({ code: 'ABC234', senderE164: '+94777654321' });

    expect(r).toEqual({ ok: false, reason: 'wrong_sender' });
    expect(verifiedWrites()).toHaveLength(0);
  });

  it('burns an attempt on a wrong sender so a leaked code cannot be ground down', async () => {
    state.challenge = challengeFor();
    await redeemPhoneVerification({ code: 'ABC234', senderE164: '+94777654321' });

    expect(state.writes.some((w) => 'attempts' in w.values)).toBe(true);
    expect(state.audits[0]).toMatchObject({
      action: 'contact_verified',
      metadata: expect.objectContaining({ outcome: 'wrong_sender' }),
    });
  });

  it('stops accepting once the attempt budget is spent', async () => {
    state.challenge = challengeFor({ attempts: MAX_VERIFICATION_ATTEMPTS });
    // Even the RIGHT sender is refused — the challenge is spent, not the number.
    const r = await redeemPhoneVerification({ code: 'ABC234', senderE164: OWNER });

    expect(r).toEqual({ ok: false, reason: 'too_many_attempts' });
    expect(verifiedWrites()).toHaveLength(0);
  });

  it('verifies when the sender IS the number, across differing formats', async () => {
    state.challenge = challengeFor();
    // Meta sends bare digits; the challenge holds E.164. They must still agree.
    const r = await redeemPhoneVerification({ code: 'ABC234', senderE164: '94771234567' });

    expect(r.ok).toBe(true);
    const write = verifiedWrites()[0];
    expect(write.values).toMatchObject({
      verified: true,
      verifiedBy: 42, // the ops identity, as the WhatsApp intake path does
      isWhatsApp: true, // they demonstrably just messaged us from it
    });
    expect(state.audits.at(-1)).toMatchObject({
      metadata: expect.objectContaining({ outcome: 'verified' }),
    });
  });

  it('rejects an unknown code', async () => {
    state.challenge = null;
    const r = await redeemPhoneVerification({ code: 'ZZZZZZ', senderE164: OWNER });

    expect(r).toEqual({ ok: false, reason: 'not_found' });
    expect(verifiedWrites()).toHaveLength(0);
  });

  it('rejects an expired challenge even from the right number', async () => {
    state.challenge = challengeFor({ expiresAt: new Date(Date.now() - 1) });
    const r = await redeemPhoneVerification({ code: 'ABC234', senderE164: OWNER });

    expect(r).toEqual({ ok: false, reason: 'expired' });
    expect(verifiedWrites()).toHaveLength(0);
  });

  it('treats a redelivered message as already_used rather than re-verifying', async () => {
    state.challenge = challengeFor({ consumedAt: new Date() });
    const r = await redeemPhoneVerification({ code: 'ABC234', senderE164: OWNER });

    expect(r).toEqual({ ok: false, reason: 'already_used' });
    expect(verifiedWrites()).toHaveLength(0);
  });

  it('refuses when the sender number cannot be normalized at all', async () => {
    state.challenge = challengeFor();
    const r = await redeemPhoneVerification({ code: 'ABC234', senderE164: 'garbage' });

    expect(r).toEqual({ ok: false, reason: 'wrong_sender' });
    expect(verifiedWrites()).toHaveLength(0);
  });
});
