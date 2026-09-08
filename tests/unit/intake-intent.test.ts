import { describe, expect, it } from 'vitest';
import { classifyIntent, hasBudgetComparator, hasSeekingLanguage } from '@/lib/intake/intent';
import { parseIntakeRules } from '@/lib/intake/parser/rule-parser';

/**
 * The regression these exist for: "Maharagama, 2 bedrooms, under 70k" used to be
 * extracted as a property whose rent is 70,000 and published as a real listing,
 * with the tenant's own number as its public contact and their account silently
 * converted to a landlord.
 */

const msg = (text: string, mediaIds: string[] = []) => ({ text, mediaIds });
const ctx = (hasOpenIntake = false) => ({ hasOpenIntake });
const classify = (text: string, mediaIds: string[] = [], open = false) =>
  classifyIntent(msg(text, mediaIds), parseIntakeRules(text), ctx(open));

describe('the bug this module exists for', () => {
  it('reads a budget search as a search, not a listing', () => {
    expect(classify('Maharagama, 2 bedrooms, under 70k')).toBe('search');
  });

  it('still extracts it as listing-shaped — which is why the guard is needed', () => {
    // If this ever stops being true the parser has changed underneath us, and
    // the classifier is guarding against something that no longer happens.
    const parsed = parseIntakeRules('Maharagama, 2 bedrooms, under 70k');
    expect(parsed.city).toBe('Maharagama');
    expect(parsed.bedrooms).toBe(2);
    expect(parsed.rentPerMonth).toBe(70000);
  });

  it('reads the other phrasings a tenant actually uses', () => {
    for (const text of [
      'Need an annex near Kottawa, max 50k',
      'House around Nugegoda, 3 bedrooms, parking, below 100k',
      'Looking for a 2BR in Dehiwala',
      'Anyone have a house in Kandy under 60000 rent',
      'Any 3 bedroom available in Negombo?',
      'searching for annex Maharagama upto 45k',
    ]) {
      expect(classify(text), text).toBe('search');
    }
  });
});

describe('a landlord is never mistaken for a searcher', () => {
  it('photos mean a listing, whatever the words say', () => {
    // Nobody searches for a rental by sending pictures of one.
    expect(classify('Looking for tenants, Maharagama 2BR under 70k', ['media-1'])).toBe('listing');
  });

  it('an open intake wins over everything — they are mid-submission', () => {
    expect(classify('under 70k', [], true)).toBe('listing');
  });

  it('a street address means a listing', () => {
    expect(classify('45/2 Temple Road, Maharagama. 2 bedrooms. Rent 70000')).toBe('listing');
  });

  it('a phone number in the body means a listing', () => {
    expect(classify('Maharagama 2 bedrooms rent 70000 call 0771234567')).toBe('listing');
  });

  it('a greeting with no detail keeps the existing checklist path', () => {
    expect(classify('Hi')).toBe('listing');
    expect(classify('I want to list my house')).toBe('listing');
    expect(classify('')).toBe('listing');
  });
});

describe('seeking language outranks a phone number', () => {
  /*
   * Tenants do leave their number. Treating that as an advert is exactly the
   * bug, so the deliberate signal wins over the incidental one.
   */
  it('classifies a searcher who left their number as a search', () => {
    expect(classify('Looking for a 2BR under 70k in Maharagama, call me on 0771234567')).toBe(
      'search'
    );
  });

  it('but photos still outrank seeking language', () => {
    expect(classify('Looking for tenants — 2BR Maharagama 70k', ['m1'])).toBe('listing');
  });
});

describe('ambiguity is asked about, never guessed', () => {
  it('listing-shaped detail with no directional signal is ambiguous', () => {
    expect(classify('Maharagama 2 bedrooms 70000')).toBe('ambiguous');
    expect(classify('Nugegoda 3BR 95000')).toBe('ambiguous');
  });

  it('an unrecognised phrase degrades to ambiguous, never to listing', () => {
    // The cost of a vocabulary gap must be a question, not a fabricated listing.
    expect(classify('Maharagama 2 bedrooms 70000 pamanak')).toBe('ambiguous');
  });
});

describe('the signal detectors', () => {
  it('recognises the comparators tenants write', () => {
    for (const t of ['under 70k', 'below 50000', 'max 60k', 'up to 80k', 'upto 80k',
                     'within 45k', 'no more than 90k', 'less than 70k', 'my budget is 60k',
                     'between 50k and 70k', 'around 65k']) {
      expect(hasBudgetComparator(t), t).toBe(true);
    }
  });

  it('does not fire on a plain rent statement', () => {
    for (const t of ['Rent 70000 per month', '2BR house rent 85k', 'Monthly 60,000']) {
      expect(hasBudgetComparator(t), t).toBe(false);
    }
  });

  it('excludes bare want/need, which a landlord also uses', () => {
    // "I want to rent out my annex" is a landlord.
    expect(hasSeekingLanguage('I want to rent out my annex')).toBe(false);
    expect(hasSeekingLanguage('I need to rent out my place')).toBe(false);
    expect(hasSeekingLanguage('Looking for a place')).toBe(true);
    expect(hasSeekingLanguage('Need an annex')).toBe(true);
  });
});
