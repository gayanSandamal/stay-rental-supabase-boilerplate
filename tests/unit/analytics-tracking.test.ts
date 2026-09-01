import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { visitorHash, visitorDayKey } from '@/lib/analytics/visitor-hash';
import { CONTACT_CHANNELS, isContactChannel } from '@/lib/analytics/contact-events';

const originalSalt = process.env.VIEW_HASH_SALT;
afterEach(() => {
  if (originalSalt === undefined) delete process.env.VIEW_HASH_SALT;
  else process.env.VIEW_HASH_SALT = originalSalt;
});

const DAY_1 = new Date('2026-08-31T09:00:00Z');
const DAY_1_LATE = new Date('2026-08-31T23:59:59Z');
const DAY_2 = new Date('2026-09-01T00:00:01Z');

describe('visitor hash', () => {
  it('fits the varchar(64) column exactly', () => {
    expect(visitorHash('1.2.3.4', 'Mozilla/5.0', DAY_1)).toHaveLength(64);
  });

  it('is stable for the same visitor within a day', () => {
    expect(visitorHash('1.2.3.4', 'Mozilla/5.0', DAY_1)).toBe(
      visitorHash('1.2.3.4', 'Mozilla/5.0', DAY_1_LATE)
    );
  });

  /*
   * The rotation is the privacy guarantee AND the definition of the metric:
   * "unique viewers this week" means "unique per day, summed", never a
   * cross-day identity we never asked permission to build.
   */
  it('rotates at the UTC day boundary, so nobody is tracked across days', () => {
    expect(visitorHash('1.2.3.4', 'Mozilla/5.0', DAY_1_LATE)).not.toBe(
      visitorHash('1.2.3.4', 'Mozilla/5.0', DAY_2)
    );
    expect(visitorDayKey(DAY_1_LATE)).toBe('2026-08-31');
    expect(visitorDayKey(DAY_2)).toBe('2026-09-01');
  });

  it('separates different visitors on the same day', () => {
    const a = visitorHash('1.2.3.4', 'Mozilla/5.0', DAY_1);
    expect(visitorHash('5.6.7.8', 'Mozilla/5.0', DAY_1)).not.toBe(a);
    expect(visitorHash('1.2.3.4', 'Safari/17', DAY_1)).not.toBe(a);
  });

  it('a missing user-agent still hashes rather than throwing', () => {
    expect(visitorHash('1.2.3.4', null, DAY_1)).toHaveLength(64);
  });

  it('is salted — the salt changes the output', () => {
    process.env.VIEW_HASH_SALT = 'salt-one';
    const one = visitorHash('1.2.3.4', 'Mozilla/5.0', DAY_1);
    process.env.VIEW_HASH_SALT = 'salt-two';
    expect(visitorHash('1.2.3.4', 'Mozilla/5.0', DAY_1)).not.toBe(one);
  });

  it('never puts the salt in a NEXT_PUBLIC_ variable', () => {
    const source = readFileSync(join(process.cwd(), 'lib/analytics/visitor-hash.ts'), 'utf-8');
    expect(source).not.toContain('NEXT_PUBLIC_VIEW_HASH_SALT');
  });
});

describe('contact channels', () => {
  it('accepts exactly the two buttons the listing page renders', () => {
    expect([...CONTACT_CHANNELS]).toEqual(['call', 'whatsapp']);
    expect(isContactChannel('call')).toBe(true);
    expect(isContactChannel('whatsapp')).toBe(true);
  });

  it('rejects anything else, including near misses from a hand-rolled caller', () => {
    for (const value of ['Call', 'sms', '', null, undefined, 7, {}]) {
      expect(isContactChannel(value)).toBe(false);
    }
  });
});

/**
 * The contact beacon must never be able to stop a renter phoning a landlord.
 * Analytics that can break the product they measure are worse than no
 * analytics, so the anchor stays a plain anchor: no preventDefault, no awaited
 * fetch before navigation, no disabled state.
 */
describe('contact link never gates the tap', () => {
  // Comments stripped: the component explains this rule at length in prose, and
  // an un-stripped scan matches the explanation instead of the code.
  const source = readFileSync(join(process.cwd(), 'components/contact-click-tracker.tsx'), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('does not cancel the click', () => {
    expect(source).not.toContain('preventDefault');
  });

  it('does not await anything in the click handler', () => {
    expect(source).not.toMatch(/onClick=\{[^}]*await/);
    expect(source).not.toContain('async function record');
  });

  it('passes the href straight through to the anchor', () => {
    expect(source).toMatch(/<a\s+href=\{href\}/);
  });

  it('uses sendBeacon with a keepalive fetch fallback', () => {
    expect(source).toContain('navigator.sendBeacon');
    expect(source).toContain('keepalive: true');
  });
});
