import { describe, expect, it } from 'vitest';
import { parseIntakeRules } from '@/lib/intake/parser/rule-parser';
import { hasListingDetail } from '@/lib/intake/parser/types';

/**
 * Which first-contact reply a sender gets hinges entirely on this predicate:
 * true → the plain ack, false → the "send us these details" checklist. Handing
 * the checklist to someone who already typed a full listing reads as the bot
 * ignoring them, so these cases are the product behaviour, not an internal
 * detail.
 */
const detail = (text: string) => hasListingDetail(parseIntakeRules(text));

describe('hasListingDetail', () => {
  it('is true for the full submission that wrongly got the checklist', () => {
    expect(
      detail(
        'A house for rent at Pannipitiya\n15, Mill road, Dehiwala\n2 bedrooms\n1 bathroom\n60,000 per month'
      )
    ).toBe(true);
  });

  it('is true for a partial submission — the gaps are the cron’s job, not a checklist', () => {
    expect(detail('2 bedroom house in Nugegoda')).toBe(true);
    expect(detail('House for rent, 45000 per month')).toBe(true);
  });

  it('is false for greetings and chatter, which is what the checklist is for', () => {
    for (const t of ['hi', 'Hello', 'Ayubowan', 'I want to list my place', 'good morning']) {
      expect(detail(t)).toBe(false);
    }
  });

  // A property type with no facts around it is an opening line, not a listing —
  // this sender needs the checklist most, so the type alone must not suppress it.
  it('is false when only a property type was mentioned', () => {
    expect(detail('I want to list my house')).toBe(false);
    expect(detail('I have an apartment to rent out')).toBe(false);
  });

  it('is false for an empty caption (photos only)', () => {
    expect(detail('')).toBe(false);
  });
});
