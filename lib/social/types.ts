/**
 * Social auto-publish contracts.
 *
 * Deliberately mirrors `lib/intake/channels/types.ts`: a core that knows nothing
 * about any particular network, plus one adapter per platform. The worker in
 * `publish.ts` only ever sees this interface.
 */

export type SocialPlatform = 'facebook_page' | 'instagram' | 'tiktok' | 'facebook_group';

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  'facebook_page',
  'instagram',
  'tiktok',
  'facebook_group',
];

/** Everything an adapter needs. No DB access from inside an adapter. */
export interface SocialPostInput {
  listingId: number;
  /** Already shaped for this platform — length caps and link handling applied. */
  caption: string;
  /**
   * Public JPEG URLs on OUR domain (see app/api/social/img/…). Never Supabase
   * URLs: Instagram rejects WebP, and TikTok only pulls from a domain we have
   * verified in its developer portal.
   */
  imageUrls: string[];
  listingUrl: string;
}

export type PublishResult =
  | { ok: true; remotePostId: string; permalink?: string; note?: string }
  | {
      ok: false;
      error: string;
      /**
       * Whether another attempt could plausibly succeed. A timeout or a 5xx is
       * retriable; an expired token or a rejected image is not — retrying those
       * just burns the attempt budget and spams ops with the same failure.
       */
      retriable: boolean;
      /**
       * Rate-limited: leave the row queued and do NOT count the attempt. The
       * job is fine, the window is full.
       */
      rateLimited?: boolean;
    };

export interface SocialAdapter {
  readonly platform: SocialPlatform;
  /**
   * False when credentials are missing. Mirrors `isIntakeConfigured()`: the
   * feature stays dormant rather than erroring, and the adapter dry-runs.
   */
  isConfigured(): boolean;
  /**
   * Whether `remove()` can actually delete the post. Only Facebook Page can.
   * Instagram and TikTok expose no delete endpoint, so a takedown there is a
   * task for a human and the ops UI has to say so plainly.
   */
  readonly supportsRemove: boolean;
  publish(input: SocialPostInput): Promise<PublishResult>;
  remove(remotePostId: string): Promise<boolean>;
}
