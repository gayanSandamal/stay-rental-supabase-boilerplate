import { describe, expect, it } from 'vitest';
import { socialResultsMessage, type SocialResultItem } from '@/lib/intake/messages';

/**
 * The message that tells a landlord where their listing actually went live.
 *
 * Its whole job is to be TRUE. This feature has already shipped one version of
 * the opposite — back-office rows reading `posted` for dry runs that never left
 * the building — and a WhatsApp message claiming "we shared it!" for four dry
 * runs would be the same lie, delivered to the person whose photos it concerns.
 */

const PULL_DOWN = 'https://easyrent.lk/l/tok3n/s/22';

const item = (over: Partial<SocialResultItem> = {}): SocialResultItem => ({
  platform: 'facebook_page',
  permalink: 'https://www.facebook.com/1229347226919525_10001',
  dryRun: false,
  ...over,
});

describe('socialResultsMessage', () => {
  it('lists every platform that really posted, with its link', () => {
    const msg = socialResultsMessage(
      '2BR House in Ganemulla',
      [
        item(),
        item({ platform: 'instagram', permalink: 'https://www.instagram.com/p/abc' }),
      ],
      PULL_DOWN
    );

    expect(msg).toContain('2BR House in Ganemulla');
    expect(msg).toContain('https://www.facebook.com/1229347226919525_10001');
    expect(msg).toContain('https://www.instagram.com/p/abc');
    expect(msg).toContain(PULL_DOWN);
  });

  it('returns null when everything was a dry run — we say nothing at all', () => {
    const msg = socialResultsMessage(
      '2BR House in Ganemulla',
      [
        item({ dryRun: true }),
        item({ platform: 'instagram', dryRun: true }),
        item({ platform: 'tiktok', dryRun: true }),
      ],
      PULL_DOWN
    );
    // Not an empty string — null, so the caller sends nothing rather than an
    // announcement about posts that never existed.
    expect(msg).toBeNull();
  });

  it('omits dry-run platforms but still reports the real ones', () => {
    const msg = socialResultsMessage(
      'House',
      [item(), item({ platform: 'instagram', dryRun: true })],
      PULL_DOWN
    );
    expect(msg).toContain('Facebook');
    expect(msg).not.toContain('Instagram');
  });

  it('never mentions the Facebook Group — it is an ops draft, not a post', () => {
    const msg = socialResultsMessage(
      'House',
      [item(), item({ platform: 'facebook_group', permalink: null })],
      PULL_DOWN
    );
    expect(msg).not.toMatch(/group/i);
  });

  it('a group draft alone produces no message', () => {
    expect(
      socialResultsMessage('House', [item({ platform: 'facebook_group' })], PULL_DOWN)
    ).toBeNull();
  });

  it('still reports a platform that posted without giving us a permalink', () => {
    // Instagram sometimes withholds `permalink`. Dropping the platform would
    // understate where the landlord's photos actually are.
    const msg = socialResultsMessage(
      'House',
      [item({ platform: 'instagram', permalink: null })],
      PULL_DOWN
    );
    expect(msg).toContain('Instagram');
    expect(msg).toContain('link not available');
  });

  it('omits the takedown line when no link could be minted', () => {
    const msg = socialResultsMessage('House', [item()], null);
    expect(msg).toContain('Facebook');
    expect(msg).not.toMatch(/changed your mind/i);
  });

  it('carries no phone number', () => {
    // Same rule the captions are held to. Nothing in this message should ever
    // grow a contact number — the product routes tenants through the listing.
    const msg = socialResultsMessage(
      '3BR House, 2 bath, LKR 40000',
      [item(), item({ platform: 'tiktok', permalink: 'https://www.tiktok.com/video/7' })],
      PULL_DOWN
    );
    const withoutUrls = (msg ?? '').replace(/https?:\/\/\S+/g, '');
    // Sri Lankan mobile / landline shapes, and any bare 7+ digit run.
    expect(withoutUrls).not.toMatch(/(?:\+?94|0)\s?7\d[\s-]?\d{3}[\s-]?\d{4}/);
    expect(withoutUrls).not.toMatch(/\d{7,}/);
  });
});
