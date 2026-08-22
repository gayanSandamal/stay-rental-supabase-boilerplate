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
