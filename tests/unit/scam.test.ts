import { describe, expect, it } from 'vitest';
import { scoreSuspicion } from '@/lib/intake/parser/scam';

const NOTHING = { rentPerMonth: null, bedrooms: null, city: null, address: null };
const REAL = { rentPerMonth: 85000, bedrooms: 2, city: 'Nugegoda', address: '12 Lake Lane' };

describe('scoreSuspicion', () => {
  it('flags money-transfer bait', () => {
    const r = scoreSuspicion('Send payment via Western Union to reserve this house', {
      ...NOTHING,
      city: 'Colombo',
    });
    expect(r.suspicious).toBe(true);
    expect(r.reason).toContain('money-transfer');
  });

  it('flags work-from-home bait', () => {
    expect(
      scoreSuspicion('Earn money fast working from home! Contact now', NOTHING).suspicious
    ).toBe(true);
  });

  it('flags crypto/investment spam stacked with a link', () => {
    const r = scoreSuspicion(
      'Buy USDT crypto investment plan guaranteed returns www.totally-legit.lk',
      NOTHING
    );
    expect(r.suspicious).toBe(true);
  });

  it('flags gibberish that extracts nothing', () => {
    expect(scoreSuspicion('asdkjh qwlkjz mnbvz xkcdq zzkjw', NOTHING).suspicious).toBe(true);
  });

  it('flags long non-rental content', () => {
    const r = scoreSuspicion(
      'Best quality spare parts for Japanese vehicles!! Visit our shop today for discounts!!!!',
      NOTHING
    );
    expect(r.suspicious).toBe(true);
  });

  it('does not flag a normal listing with a phone number and one exclamation', () => {
    const r = scoreSuspicion(
      'Beautiful 3BR house in Kandy! Rent 95,000/month. Call 0771234567',
      { ...REAL, city: 'Kandy', rentPerMonth: 95000, bedrooms: 3 }
    );
    expect(r).toEqual({ suspicious: false, reason: null });
  });

  it('does not flag a listing just for containing one link', () => {
    expect(
      scoreSuspicion('3BR house Nugegoda 85k, more photos at https://myalbum.example', REAL)
        .suspicious
    ).toBe(false);
  });

  it('does not flag terse digit-heavy but real messages', () => {
    expect(scoreSuspicion('2BR 85k Nugegoda 12 Lake Lane', REAL).suspicious).toBe(false);
  });

  it('does not flag short greetings', () => {
    expect(scoreSuspicion('Hi', NOTHING).suspicious).toBe(false);
  });

  it('is deterministic', () => {
    const input = 'Buy USDT crypto now www.x.lk';
    expect(scoreSuspicion(input, NOTHING)).toEqual(scoreSuspicion(input, NOTHING));
  });
});
