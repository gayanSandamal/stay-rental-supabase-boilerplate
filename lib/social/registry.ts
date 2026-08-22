/**
 * The adapters the worker dispatches to, and the flag that governs each.
 * Mirrors `lib/intake/channels/registry.ts`.
 */

import { isFeatureEnabled } from '@/lib/feature-flags';
import type { FeatureFlag } from '@/lib/feature-flags';
import { facebookGroupAdapter } from './adapters/facebook-group';
import { facebookPageAdapter } from './adapters/facebook-page';
import { instagramAdapter } from './adapters/instagram';
import { tiktokAdapter } from './adapters/tiktok';
import type { SocialAdapter, SocialPlatform } from './types';

export const socialAdapters: SocialAdapter[] = [
  facebookPageAdapter,
  instagramAdapter,
  tiktokAdapter,
  facebookGroupAdapter,
];

/** The sub-switch that turns each platform on or off. */
const PLATFORM_FLAGS: Record<SocialPlatform, FeatureFlag> = {
  facebook_page: 'socialPublishFacebookPage',
  instagram: 'socialPublishInstagram',
  tiktok: 'socialPublishTikTok',
  facebook_group: 'socialDraftFacebookGroup',
};

export function adapterFor(platform: SocialPlatform): SocialAdapter | undefined {
  return socialAdapters.find((a) => a.platform === platform);
}

export function isPlatformEnabled(platform: SocialPlatform): boolean {
  return isFeatureEnabled(PLATFORM_FLAGS[platform]);
}

/**
 * The platforms a new consent should enqueue for.
 *
 * Caller must have run `loadFeatureFlags()` — `isFeatureEnabled` reads a
 * synchronous snapshot.
 */
export function enabledPlatforms(): SocialPlatform[] {
  return socialAdapters.map((a) => a.platform).filter(isPlatformEnabled);
}
