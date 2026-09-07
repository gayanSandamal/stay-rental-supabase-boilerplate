import { describe, expect, it } from 'vitest';
import { extractPhoneNumbers } from '@/lib/moderation/contact-scrub';
import { parseIntakeRules } from '@/lib/intake/parser/rule-parser';

/**
 * The importer's extraction is the intake parser plus a phone sweep. These
 * tests use a realistic Sri Lankan Facebook rental ad — the format is its own
 * dialect: rent in "k" shorthand, the town as a bare word, and the number at
 * the bottom with a "call/whatsapp" lead-in.
 *
 * `parseIntakeRules` is used rather than `parseIntake` so the assertions stay
 * pure: the latter awaits the gazetteer snapshot and may call an LLM.
 */

const AD = `House for rent in Nugegoda

3 bedrooms, 2 bathrooms
Fully tiled, 3 phase
Rent 85k per month
2 months deposit

Call or WhatsApp 0771234567
Agents please do not contact`;

describe('extracting a Facebook rental ad', () => {
  const parsed = parseIntakeRules(AD);

  /*
   * These assert the REUSE is wired up, not that extraction is reliable. It
   * demonstrably is not — an ad reading "hot water" on the line above its rent
   * loses the rent entirely, because UTILITY_BEFORE_RE reads the amenity as a
   * water bill. That is a pre-existing rule-parser bug on the WhatsApp path
   * too, and it is exactly why the importer stops at a review screen instead of
   * publishing whatever the parser returned.
   */

  it('finds the town', () => {
    expect(parsed.city).toBe('Nugegoda');
  });

  it('finds the room counts', () => {
    expect(parsed.bedrooms).toBe(3);
    expect(parsed.bathrooms).toBe(2);
  });

  it('expands the "85k" shorthand landlords actually write', () => {
    expect(parsed.rentPerMonth).toBe(85000);
  });

  it('produces a title', () => {
    expect(parsed.title).toBeTruthy();
  });
});

describe('phone candidates', () => {
  it('pulls the owner number out of the ad in E.164', () => {
    expect(extractPhoneNumbers(AD)).toEqual(['+94771234567']);
  });

  it('keeps written order, so the number to call comes first', () => {
    const text = 'Call 0771111111 or the office on 0112222222';
    expect(extractPhoneNumbers(text)).toEqual(['+94771111111', '+94112222222']);
  });

  it('dedupes a number written two ways', () => {
    const text = 'Call 077 123 4567 — WhatsApp +94771234567';
    expect(extractPhoneNumbers(text)).toEqual(['+94771234567']);
  });

  it('returns nothing for an ad with no number', () => {
    expect(extractPhoneNumbers('House in Kandy, 3 rooms, 60000')).toEqual([]);
    expect(extractPhoneNumbers(null)).toEqual([]);
    expect(extractPhoneNumbers('')).toEqual([]);
  });

  it('does not mistake a rent figure for a phone number', () => {
    expect(extractPhoneNumbers('Rent 85000 per month')).toEqual([]);
  });

  /*
   * The regexes carry /g. Sharing them across calls would leave lastIndex set
   * and make the second read of the same text silently skip matches — which,
   * in the review screen, means the phone chips vanish on a page refresh.
   */
  it('returns the same result when called twice', () => {
    expect(extractPhoneNumbers(AD)).toEqual(extractPhoneNumbers(AD));
  });
});
