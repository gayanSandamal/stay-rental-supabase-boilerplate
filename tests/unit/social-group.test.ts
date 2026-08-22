import { describe, expect, it } from 'vitest';
import { groupByListing, type SocialRow } from '@/lib/social/group';

/**
 * Back Office → Social used to render one card per (listing, platform), so a
 * single listing filled four near-identical blocks with the same caption
 * printed four times. These pin the grouped shape that replaced it.
 */

const CAPTION = '2-bedroom house for rent in Ganemulla, Gampaha\nLKR 40,000/month';

let seq = 0;
function row(over: Partial<SocialRow['post']> & { listingId?: number } = {}): SocialRow {
  seq += 1;
  return {
    post: {
      id: seq,
      listingId: 22,
      platform: 'facebook_page',
      status: 'posted',
      remotePostId: '1229347226919525_1000',
      remotePermalink: 'https://www.facebook.com/x',
      caption: CAPTION,
      attempts: 1,
      leaseUntil: null,
      error: null,
      postedAt: new Date('2026-08-22T21:11:29Z'),
      pulledAt: null,
      pulledBy: null,
      createdAt: new Date(`2026-08-22T20:0${seq % 10}:00Z`),
      updatedAt: new Date('2026-08-22T21:11:29Z'),
      ...over,
    } as SocialRow['post'],
    listingTitle: '2BR House in Ganemulla',
    listingStatus: 'active',
  };
}

describe('groupByListing', () => {
  it('collapses one listing’s four platform rows into a single card', () => {
    const groups = groupByListing([
      row(),
      row({ platform: 'instagram', remotePostId: 'dryrun-instagram-22' }),
      row({ platform: 'tiktok', remotePostId: 'dryrun-tiktok-22' }),
      row({ platform: 'facebook_group', status: 'skipped', remotePostId: null }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].listingId).toBe(22);
    expect(groups[0].posts).toHaveLength(4);
    expect(groups[0].title).toBe('2BR House in Ganemulla');
  });

  it('prints a shared caption once, not once per platform', () => {
    const groups = groupByListing([
      row(),
      row({ platform: 'instagram' }),
      row({ platform: 'tiktok' }),
    ]);
    expect(groups[0].captions).toHaveLength(1);
    expect(groups[0].captions[0].platforms).toEqual([
      'facebook_page',
      'instagram',
      'tiktok',
    ]);
  });

  it('keeps genuinely different captions apart, labelled by platform', () => {
    // Instagram renders URLs as plain text, so its caption really does differ.
    const groups = groupByListing([
      row(),
      row({ platform: 'instagram', caption: `${CAPTION}\nLink in bio #EZR22` }),
    ]);
    expect(groups[0].captions).toHaveLength(2);
    expect(groups[0].captions.map((c) => c.platforms.join())).toEqual([
      'facebook_page',
      'instagram',
    ]);
  });

  it('counts a dry run as a dry run, never as a live post', () => {
    const groups = groupByListing([
      row(),
      row({ platform: 'instagram', remotePostId: 'dryrun-instagram-22' }),
      row({ platform: 'facebook_group', status: 'skipped', remotePostId: null }),
    ]);
    // `live` gates the "Pull down all" button. Counting a dry run here would
    // offer a takedown for something that was never sent.
    expect(groups[0].live).toBe(1);
    expect(groups[0].summary).toContain('1 posted');
    expect(groups[0].summary).toContain('1 dry run');
    expect(groups[0].summary).toContain('1 draft');
  });

  it('surfaces the failed count that drives the per-listing retry', () => {
    const groups = groupByListing([
      row({ status: 'failed', remotePostId: null, error: 'token expired' }),
      row({ platform: 'instagram', status: 'failed', remotePostId: null }),
    ]);
    expect(groups[0].failed).toBe(2);
    expect(groups[0].live).toBe(0);
    expect(groups[0].summary).toBe('2 failed');
  });

  it('separates listings and puts the most recent first', () => {
    const groups = groupByListing([
      row({ listingId: 21, createdAt: new Date('2026-08-22T14:20:36Z') }),
      row({ listingId: 22, createdAt: new Date('2026-08-22T18:30:35Z') }),
      row({ listingId: 21, platform: 'instagram', createdAt: new Date('2026-08-22T14:20:37Z') }),
    ]);
    expect(groups.map((g) => g.listingId)).toEqual([22, 21]);
    expect(groups[1].posts).toHaveLength(2);
  });

  it('returns nothing for no rows', () => {
    expect(groupByListing([])).toEqual([]);
  });
});
