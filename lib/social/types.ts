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
  /**
   * The privacy level a HUMAN chose for this post. TikTok only.
   *
   * TikTok's Direct Post rules put this decision with the creator, not the app:
   * it may not silently default to public. When ops posts from the review
   * screen they pick one, and it is passed through here.
   *
   * Absent on the cron path, where there is no human in the loop — the adapter
   * then falls back to the most public level the account actually offers, which
   * for an unaudited client is SELF_ONLY.
   */
  privacyLevel?: string;
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

/**
 * Prefix every adapter uses for the id it invents when it has no credentials.
 * Dry-run state is derived from this rather than stored in a column: the prefix
 * is already deterministic, and a schema change for a display concern is not
 * worth another migration.
 */
export const DRY_RUN_ID_PREFIX = 'dryrun-';

/** Was this row a dry run — i.e. nothing was ever sent to the platform? */
export function isDryRunPost(remotePostId: string | null | undefined): boolean {
  return Boolean(remotePostId?.startsWith(DRY_RUN_ID_PREFIX));
}
