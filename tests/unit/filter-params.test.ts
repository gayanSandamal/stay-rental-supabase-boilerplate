import { describe, it, expect } from 'vitest';
import {
  FILTER_KEYS,
  isBooleanFilterKey,
  parseListingFilters,
  activeFilterCount,
  canonicalizeFilterParams,
} from '@/lib/listings/filter-params';
import { filterFormConfig } from '@/lib/forms/filter-form-config';

/**
 * The bug this module was written to end: the filter form offered 33 fields,
 * `getActiveListings` implemented all 33, and four hand-maintained copies of a
 * key list each passed the same 14. A renter filtered on "gated, CCTV, max 2
 * months deposit", saw a chip confirming each, and got results ignoring all
 * three — then alerts that ignored them too.
 */
describe('filter parity with the form config', () => {
  const formKeys = filterFormConfig.fields.map((f) => f.name).sort();

  it('the parser knows exactly the fields the form offers — in both directions', () => {
    // Both directions on purpose. Missing keys are the original bug; extra keys
    // would be a filter the parser passes that no renter can ever set.
    expect([...FILTER_KEYS].sort()).toEqual(formKeys);
  });

  it('every form field reaches getActiveListings filters', () => {
    // Values chosen to be valid for each field's kind, so nothing is dropped by
    // coercion rather than by a missing spec entry.
    const params = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      if (key === 'sortBy') {
        params.set(key, 'newest');
      } else if (isBooleanFilterKey(key)) {
        params.set(key, 'true');
      } else if (key === 'locationRadius') {
        params.set(key, '5');
        params.set('latitude', '6.9271');
        params.set('longitude', '79.8612');
      } else {
        params.set(key, key.startsWith('min') || key.startsWith('max') ? '2' : '2');
      }
    }
    const parsed = parseListingFilters(params) as Record<string, unknown>;
    for (const key of FILTER_KEYS) {
      expect(parsed, `"${key}" was dropped by the parser`).toHaveProperty(key);
    }
  });
});

describe('sortBy — the paid-visibility guard', () => {
  /*
   * getActiveListings applies the Featured > Boost > plan-tier ranking ONLY
   * when sortBy is falsy. Any explicit value bypasses it. The form used to
   * default this field to 'newest' and the modal writes every non-empty value
   * to the URL, so honouring all 33 filters naively would have disabled paid
   * visibility on every filtered search, silently.
   */
  it('the form does not default to a value that bypasses the ranking', () => {
    const sortField = filterFormConfig.fields.find((f) => f.name === 'sortBy');
    expect(sortField?.defaultValue ?? '').toBe('');
  });

  it('offers an explicit "no sort" option so the default is selectable', () => {
    const sortField = filterFormConfig.fields.find((f) => f.name === 'sortBy');
    expect(sortField?.options?.some((o) => o.value === '')).toBe(true);
  });

  it('omits sortBy when absent, preserving the ranking', () => {
    expect(parseListingFilters(new URLSearchParams())).not.toHaveProperty('sortBy');
  });

  it('omits an unknown sortBy rather than defaulting it', () => {
    // getActiveListings falls through to desc(createdAt) for anything it does
    // not recognise, so defaulting here would let ?sortBy=garbage disable the
    // ranking just as effectively as sortBy=newest did.
    const parsed = parseListingFilters(new URLSearchParams('sortBy=garbage'));
    expect(parsed).not.toHaveProperty('sortBy');
  });

  it('passes through a sort the renter deliberately chose', () => {
    const parsed = parseListingFilters(new URLSearchParams('sortBy=price_asc'));
    expect(parsed).toMatchObject({ sortBy: 'price_asc' });
  });
});

describe('boolean coercion', () => {
  it("sets a boolean filter only for the literal 'true'", () => {
    expect(parseListingFilters(new URLSearchParams('isGated=true'))).toMatchObject({
      isGated: true,
    });
  });

  it.each(['false', '', '0', '1', 'yes', 'TRUE'])(
    'omits the key entirely for %o rather than emitting false',
    (value) => {
      /*
       * Asserting ABSENCE, not `false`. getActiveListings writes
       * `filters?.isGated !== undefined ? eq(listings.isGated, filters.isGated)`,
       * so emitting false would filter FOR ungated properties — the inverse of
       * what an unchecked box means. Unchecked is "don't care".
       */
      const parsed = parseListingFilters(new URLSearchParams(`isGated=${value}`));
      expect(parsed).not.toHaveProperty('isGated');
    }
  );

  it('handles a real boolean from a stored saved-search blob', () => {
    expect(parseListingFilters({ parking: true })).toMatchObject({ parking: true });
    expect(parseListingFilters({ parking: false })).not.toHaveProperty('parking');
  });
});

describe('numeric coercion', () => {
  it.each(['abc', '-5', '0', '', 'NaN', '1e9999', '12abc', '2.5'])(
    'drops junk value %o',
    (value) => {
      const parsed = parseListingFilters(new URLSearchParams(`minPrice=${value}`));
      expect(parsed).not.toHaveProperty('minPrice');
    }
  );

  it('never emits NaN', () => {
    const parsed = parseListingFilters(
      new URLSearchParams('minPrice=abc&maxPrice=xyz&bedrooms=&bathrooms=oops')
    ) as Record<string, unknown>;
    for (const value of Object.values(parsed)) {
      expect(Number.isNaN(value as number)).toBe(false);
    }
  });

  it('trims surrounding whitespace rather than rejecting the value', () => {
    expect(parseListingFilters(new URLSearchParams('minPrice= 7 '))).toMatchObject({
      minPrice: 7,
    });
  });

  it('parses a real number', () => {
    expect(parseListingFilters(new URLSearchParams('maxPrice=80000'))).toMatchObject({
      maxPrice: 80000,
    });
  });
});

describe('allow-list — server-only keys can never come from the URL', () => {
  /*
   * Not tidiness, a security property. Callers pass raw request params in, and
   * these keys are set afterwards from authenticated truth. A permissive copy
   * would let a visitor see premium-only listings or defeat paid early access.
   */
  it.each([
    'excludeExclusive',
    'sortExclusiveFirst',
    'hideNewListingsHours',
    'publishedSince',
    'publishedUntil',
    'limit',
    'offset',
  ])('drops %o', (key) => {
    const parsed = parseListingFilters(new URLSearchParams(`${key}=0`));
    expect(parsed).not.toHaveProperty(key);
  });

  it('drops unknown params entirely', () => {
    const parsed = parseListingFilters(
      new URLSearchParams('page=2&limit=999999&signed_up=1&nonsense=x')
    );
    expect(Object.keys(parsed)).toEqual([]);
  });
});

describe('locationRadius', () => {
  it('is omitted without coordinates, since nothing supplies them yet', () => {
    // Emitting the radius alone would be another filter that renders a chip and
    // changes nothing — the exact failure this module exists to end.
    expect(parseListingFilters(new URLSearchParams('locationRadius=5'))).not.toHaveProperty(
      'locationRadius'
    );
  });

  it('is emitted with coordinates', () => {
    const parsed = parseListingFilters(
      new URLSearchParams('locationRadius=5&latitude=6.9271&longitude=79.8612')
    );
    expect(parsed).toMatchObject({ locationRadius: '5', latitude: 6.9271, longitude: 79.8612 });
  });
});

describe('activeFilterCount', () => {
  it('does not count sortBy as a filter', () => {
    // A bare visit used to read as "1 filter active" because sortBy=newest
    // rode along in the URL.
    expect(activeFilterCount(new URLSearchParams('sortBy=newest'))).toBe(0);
  });

  it('counts only genuinely applied filters', () => {
    expect(activeFilterCount(new URLSearchParams('city=Colombo&bedrooms=2&isGated=true'))).toBe(3);
  });

  it('does not count an unchecked box', () => {
    expect(activeFilterCount(new URLSearchParams('isGated=false'))).toBe(0);
  });
});

describe('canonicalizeFilterParams', () => {
  it('is stable regardless of input key order', () => {
    const a = canonicalizeFilterParams(new URLSearchParams('city=Kandy&bedrooms=2'));
    const b = canonicalizeFilterParams(new URLSearchParams('bedrooms=2&city=Kandy'));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('strips junk so a stored blob cannot fail to parse later', () => {
    const out = canonicalizeFilterParams(
      new URLSearchParams('city=Galle&page=3&signed_up=1&minPrice=abc')
    );
    expect(out).toEqual({ city: 'Galle' });
  });
});
