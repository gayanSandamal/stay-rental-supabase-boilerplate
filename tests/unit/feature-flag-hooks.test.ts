import { describe, expect, it, vi } from 'vitest';

// Both hooks call nothing but useSWR, so stubbing SWR lets them run as plain
// functions — no renderer, no jsdom.
const swr: { data: unknown } = { data: undefined };
vi.mock('swr', () => ({
  default: () => ({ data: swr.data }),
}));

import { featureFlagDefaults } from '@/lib/feature-flags';
import { useFeatureFlag, useFeatureValue } from '@/lib/hooks/use-feature-flags';

describe('useFeatureValue', () => {
  it('falls back to the code default while the request is in flight', () => {
    swr.data = undefined;
    expect(useFeatureValue('maxPhotosPerListing')).toBe(
      featureFlagDefaults.maxPhotosPerListing
    );
  });

  it('returns the number, not a truthiness of it', () => {
    swr.data = { flags: { maxPhotosPerListing: 3 } };
    expect(useFeatureValue('maxPhotosPerListing')).toBe(3);
  });

  it('passes through a cap-disabling 0 instead of defaulting over it', () => {
    swr.data = { flags: { maxPhotosPerListing: 0 } };
    expect(useFeatureValue('maxPhotosPerListing')).toBe(0);
  });
});

describe('useFeatureFlag', () => {
  it('still reads booleans from the same payload', () => {
    swr.data = { flags: { enablePricingSection: true } };
    expect(useFeatureFlag('enablePricingSection')).toBe(true);
    swr.data = { flags: { enablePricingSection: false } };
    expect(useFeatureFlag('enablePricingSection')).toBe(false);
  });
});
