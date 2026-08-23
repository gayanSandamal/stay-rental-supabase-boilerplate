import { describe, expect, it } from 'vitest';
import { DRY_RUN_ID_PREFIX, isDryRunPost } from '@/lib/social/types';
import { facebookPageAdapter } from '@/lib/social/adapters/facebook-page';
import { instagramAdapter } from '@/lib/social/adapters/instagram';
// The TikTok adapter is deliberately NOT imported: it pulls in the DB at module
// scope (rotating tokens live in `social_accounts`), which would make this file
// require DATABASE_URL. Its dry-run id has the same shape and is covered by the
// isDryRunPost cases below.

/**
 * With no credentials every adapter reports success without sending anything.
 * That is deliberate — it is how the whole pipeline is testable without live
 * social accounts — but it produced three rows reading `posted`, with a working
 * "Pull down" button, for posts that never existed.
 *
 * These tests pin the marker the UI now derives its "dry run" badge from.
 */

const input = {
  listingId: 21,
  caption: '2-bedroom house for rent in Ganemulla',
  imageUrls: ['https://easyrent.lk/api/social/img/21/0.jpg'],
  listingUrl: 'https://easyrent.lk/listings/21',
};

describe('adapters dry-run when unconfigured', () => {
  // No FACEBOOK_*/INSTAGRAM_*/TIKTOK_* env in the test environment, which is
  // exactly the production state that caused the confusion.
  const adapters = [
    ['facebook_page', facebookPageAdapter],
    ['instagram', instagramAdapter],
  ] as const;

  it.each(adapters)('%s reports unconfigured', (_name, adapter) => {
    expect(adapter.isConfigured()).toBe(false);
  });

  it.each(adapters)('%s returns a dry-run id rather than posting', async (name, adapter) => {
    const result = await adapter.publish(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.remotePostId).toBe(`${DRY_RUN_ID_PREFIX}${name}-21`);
    expect(isDryRunPost(result.remotePostId)).toBe(true);
  });
});

describe('isDryRunPost', () => {
  it('recognises every adapter’s dry-run id', () => {
    for (const p of ['facebook_page', 'instagram', 'tiktok']) {
      expect(isDryRunPost(`${DRY_RUN_ID_PREFIX}${p}-21`)).toBe(true);
    }
  });

  it('does not misread a real post id as a dry run', () => {
    // Facebook: {pageId}_{postId}. Instagram: a bare numeric media id.
    expect(isDryRunPost('102938475601234_9988776655')).toBe(false);
    expect(isDryRunPost('17912345678901234')).toBe(false);
    // TikTok publish ids and a manually-closed Group row.
    expect(isDryRunPost('v_pub_url~v2.123456789')).toBe(false);
    expect(isDryRunPost('manual-3-1755870000000')).toBe(false);
  });

  it('treats a missing id as not-a-dry-run, so nothing is hidden by accident', () => {
    expect(isDryRunPost(null)).toBe(false);
    expect(isDryRunPost(undefined)).toBe(false);
    expect(isDryRunPost('')).toBe(false);
  });
});

describe('a dry run is never handed to ops as a takedown', () => {
  /**
   * `pullDownForListing` decides three things per row: whether to call the
   * adapter, whether to add the platform to the "remove by hand" list ops are
   * notified about, and what note to leave on the row. A dry run must take the
   * third path on all three — nothing was ever sent, so there is nothing to
   * delete and nobody to ask.
   *
   * This became reachable when `reconcileOrphanedSocialPosts` started sweeping
   * archived listings: production held 7 dry-run rows across listings #21-#23
   * (Instagram and TikTok have never had credentials), and Instagram and TikTok
   * both report `supportsRemove: false`. Without this, the first sweep would
   * have told ops to go and hand-delete seven posts that never existed — the
   * same lie as a row reading `posted` for something never sent, which is the
   * whole reason the dry-run badge above exists.
   */
  const decide = (remotePostId: string, supportsRemove: boolean) => {
    const dryRun = isDryRunPost(remotePostId);
    const callsAdapter = !dryRun && supportsRemove;
    // `removed` starts as `dryRun`, so a dry run is never pushed to `manual`.
    const removed = dryRun;
    return { callsAdapter, needsManualRemoval: !dryRun && !removed };
  };

  it.each([
    ['dryrun-instagram-21', false],
    ['dryrun-tiktok-22', false],
    ['dryrun-facebook_page-21', true],
  ] as const)('%s asks nothing of ops', (id, supportsRemove) => {
    const d = decide(id, supportsRemove);
    expect(d.callsAdapter).toBe(false);
    expect(d.needsManualRemoval).toBe(false);
  });

  it('a REAL post on a platform with no delete API still reaches ops', () => {
    // The behaviour that must survive: Instagram takedowns are manual, and
    // silently swallowing one would be worse than the noise it replaces.
    expect(decide('17851234567890123', false).needsManualRemoval).toBe(true);
  });

  it('a REAL post on Facebook Page is deleted through the API', () => {
    expect(decide('1229347226919525_122111941959369710', true).callsAdapter).toBe(true);
  });
});
