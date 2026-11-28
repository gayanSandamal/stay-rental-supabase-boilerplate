import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgres://test:test@127.0.0.1:1/test';
});
vi.mock('server-only', () => ({}));

import { normalizePhone } from '@/lib/auth/phone-verification';
import {
  MAX_EXTRA_PHONES,
  cleanExtraPhones,
  parseExtraPhones,
  unreadablePhones,
} from '@/lib/imports/phones';
import { resolveUpfront, upfrontType } from '@/lib/listings/upfront';
import { listingFormConfig } from '@/lib/forms/listing-form-config';
import { shouldShowField } from '@/components/form-field';
import { buildFacebookCaption } from '@/lib/social/caption';

describe('resolveUpfront', () => {
  it('stores exactly one of deposit and key money', () => {
    expect(resolveUpfront({ depositType: 'key_money', depositMonths: 3, keyMoney: '500,000' })).toEqual({
      depositMonths: null,
      keyMoney: '500000.00',
    });
    expect(resolveUpfront({ depositType: 'deposit', depositMonths: 6, keyMoney: 500000 })).toEqual({
      depositMonths: 6,
      keyMoney: null,
    });
  });

  it('refuses key money without an amount instead of inventing a deposit', () => {
    for (const keyMoney of ['', 0, -5, 'abc', null, 99_999_999_999]) {
      expect(resolveUpfront({ depositType: 'key_money', keyMoney })).toHaveProperty('error');
    }
  });

  it('infers the type for clients that never send the switch', () => {
    expect(resolveUpfront({ keyMoney: 250000 })).toEqual({ depositMonths: null, keyMoney: '250000.00' });
    expect(resolveUpfront({})).toEqual({ depositMonths: 3, keyMoney: null });
    expect(resolveUpfront({ depositMonths: 0 })).toEqual({ depositMonths: 0, keyMoney: null });
  });

  it('is a no-op on what the database hands back', () => {
    const stored = { depositMonths: null, keyMoney: '500000.00' };
    expect(upfrontType(stored)).toBe('key_money');
    expect(resolveUpfront(stored)).toEqual(stored);
  });
});

describe('the listing form', () => {
  const field = (name: string) => listingFormConfig.fields.find((f) => f.name === name)!;
  it('shows one of the two', () => {
    expect(shouldShowField(field('depositMonths'), { depositType: 'deposit' })).toBe(true);
    expect(shouldShowField(field('keyMoney'), { depositType: 'deposit' })).toBe(false);
    expect(shouldShowField(field('depositMonths'), { depositType: 'key_money' })).toBe(false);
    expect(shouldShowField(field('keyMoney'), { depositType: 'key_money' })).toBe(true);
  });
});

describe('import phones', () => {
  it('normalises, dedupes, and never repeats the owner', () => {
    const rows = cleanExtraPhones(
      [
        { phone: '072 438 1763', isWhatsApp: true },
        { phone: '+94724381763', isWhatsApp: false },
        { phone: '070 125 6170', isWhatsApp: true },
        { phone: '  ', isWhatsApp: false },
      ],
      '+94701256170',
      normalizePhone
    );
    expect(rows).toEqual([{ phone: '+94724381763', isWhatsApp: true }]);
  });

  it('keeps an unreadable number as typed but flags it', () => {
    const rows = cleanExtraPhones([{ phone: '07712', isWhatsApp: false }], null, normalizePhone);
    expect(rows).toEqual([{ phone: '07712', isWhatsApp: false }]);
    expect(unreadablePhones(rows)).toEqual(['07712']);
  });

  it('caps the list and survives malformed JSON', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ phone: `07712345${60 + i}`, isWhatsApp: false }));
    expect(cleanExtraPhones(many, null, normalizePhone)).toHaveLength(MAX_EXTRA_PHONES);
    for (const bad of [null, '', '{', '"x"', '[1,null,{"phone":5}]']) expect(parseExtraPhones(bad)).toEqual([]);
  });
});

describe('social caption', () => {
  it('quotes key money instead of the deposit, and the scrub leaves the amount alone', () => {
    const caption = buildFacebookCaption(
      { id: 1, title: 'T', city: 'Kandy', bedrooms: 2, rentPerMonth: '65000.00', depositMonths: 3, keyMoney: '1500000.00' },
      { baseUrl: 'https://easyrent.lk' }
    );
    expect(caption).toContain('Key money LKR 1,500,000');
    expect(caption).not.toContain('deposit');
  });
});
