'use client';

import useSWR from 'swr';
import {
  featureFlagDefaults,
  type FeatureFlag,
  type FeatureFlags,
} from '@/lib/feature-flags';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

/**
 * Reads the public feature flags (those marked `public` in lib/feature-flags.ts)
 * from /api/feature-flags for use in client components. Falls back to the code
 * defaults until the request resolves, so gating never flickers the wrong way.
 */
export function useFeatureFlag(flag: FeatureFlag): boolean {
  const { data } = useSWR<{ flags: Partial<FeatureFlags> }>(
    '/api/feature-flags',
    fetcher
  );
  const value = data?.flags?.[flag] ?? featureFlagDefaults[flag];
  return typeof value === 'boolean' ? value : Boolean(value);
}
