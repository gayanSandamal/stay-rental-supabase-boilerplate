import { describe, expect, it } from 'vitest';
import {
  FB_CAPTION_MAX,
  IG_CAPTION_MAX,
  IG_HASHTAG_MAX,
  TIKTOK_TITLE_MAX,
  buildCaption,
  buildFacebookCaption,
  buildInstagramCaption,
  buildTikTokTitle,
  featureBullets,
  formatLkr,
  hashtagsFor,
  referenceCode,
  stripContactDigits,
  type CaptionListing,
} from '@/lib/social/caption';

const BASE = 'https://easyrent.lk';
const opts = { baseUrl: BASE };

const listing = (over: Partial<CaptionListing> = {}): CaptionListing => ({
  id: 42,
  title: 'Bright 3-bed house in Nugegoda',
  description: 'Quiet lane, close to schools.',
  city: 'Nugegoda',
  district: 'Colombo',
  propertyType: 'house',
  bedrooms: 3,
  bathrooms: 2,
  areaSqft: 1800,
  rentPerMonth: '125000.00',
  depositMonths: 3,
  powerBackup: 'generator',
  waterSource: 'mains',
  hasFiber: true,
  parking: true,
  ...over,
});

describe('formatLkr', () => {
  it('adds thousands separators', () => {
    expect(formatLkr('125000.00')).toBe('125,000');
    expect(formatLkr(85000)).toBe('85,000');
    expect(formatLkr(950)).toBe('950');
  });

  it('leaves an unparseable amount alone rather than printing NaN', () => {
    expect(formatLkr('negotiable')).toBe('negotiable');
  });
});

/**
 * The rule the whole module exists to enforce. A landlord's phone number
 * reaching a public feed is permanent and bypasses every contact control the
 * platform has, so these cases are deliberately exhaustive.
 */
describe('stripContactDigits', () => {
  const cases: Array<[string, string]> = [
    ['Call me on 0771234567', 'Call me on'],
    ['WhatsApp 077 123 4567 anytime', 'WhatsApp anytime'],
    ['Ring 077-123-4567', 'Ring'],
    ['Contact +94 77 123 4567', 'Contact'],
    ['Call 0094771234567', 'Call'],
    ['Tel: (077) 1234567', 'Tel:'],
  ];

  it.each(cases)('removes the number from %j', (input) => {
    const out = stripContactDigits(input);
    expect(out.replace(/\D/g, '')).not.toMatch(/\d{7,}/);
  });

  it('keeps short numbers that are real listing detail', () => {
    expect(stripContactDigits('3 bedrooms, 2 baths, 1800 sqft')).toContain('1800');
    expect(stripContactDigits('Rent 125000 per month')).toContain('125000');
  });
});

describe('captions never leak a phone number', () => {
  const withNumber = listing({
    description: 'Lovely home. Call the owner on 0771234567 or +94 77 999 8888.',
  });

  it.each(['facebook_page', 'instagram', 'tiktok', 'facebook_group'] as const)(
    'strips it from the %s caption',
    (platform) => {
      const caption = buildCaption(platform, withNumber, opts);
      expect(caption).not.toContain('0771234567');
      expect(caption).not.toContain('999 8888');
      // Nothing that could be dialled survives anywhere in the body.
      const digitRuns = caption.match(/[\d\s.\-()]{7,}/g) ?? [];
      for (const run of digitRuns) {
        expect(run.replace(/\D/g, '').length).toBeLessThan(7);
      }
    }
  );
});

describe('buildFacebookCaption', () => {
  it('carries the price, location and a clickable listing URL', () => {
    const caption = buildFacebookCaption(listing(), opts);
    expect(caption).toContain('LKR 125,000/month');
    expect(caption).toContain('Nugegoda');
    expect(caption).toContain(`${BASE}/listings/42`);
  });

  it('stays inside the platform cap even with a huge description', () => {
    const caption = buildFacebookCaption(listing({ description: 'x'.repeat(20_000) }), opts);
    expect([...caption].length).toBeLessThanOrEqual(FB_CAPTION_MAX);
  });
});

describe('buildInstagramCaption', () => {
  it('points at the bio instead of a URL, because IG links are not clickable', () => {
    const caption = buildInstagramCaption(listing(), opts);
    expect(caption).not.toContain(`${BASE}/listings/42`);
    expect(caption).toContain('Link in bio');
    expect(caption).toContain(referenceCode(42));
  });

  it('respects the caption and hashtag ceilings', () => {
    const caption = buildInstagramCaption(listing({ description: 'y'.repeat(20_000) }), opts);
    expect([...caption].length).toBeLessThanOrEqual(IG_CAPTION_MAX);
    expect(hashtagsFor(listing()).length).toBeLessThanOrEqual(IG_HASHTAG_MAX);
  });
});

describe('buildTikTokTitle', () => {
  it('fits TikTok’s short title field', () => {
    const title = buildTikTokTitle(
      listing({ title: 'z'.repeat(300), city: 'Dehiwala-Mount Lavinia' })
    );
    expect([...title].length).toBeLessThanOrEqual(TIKTOK_TITLE_MAX);
  });
});

describe('featureBullets', () => {
  it('surfaces the Sri Lanka resilience fields', () => {
    const bullets = featureBullets(listing()).join(' ');
    expect(bullets).toContain('Generator backup');
    expect(bullets).toContain('Mains water');
    expect(bullets).toContain('Fiber ready');
  });

  it('omits "none" power backup rather than advertising it', () => {
    expect(featureBullets(listing({ powerBackup: 'none' })).join(' ')).not.toContain('backup');
  });

  it('omits anything absent', () => {
    const bare = featureBullets({
      id: 1,
      title: 't',
      city: 'Galle',
      bedrooms: 1,
      rentPerMonth: 30000,
    });
    expect(bare).toEqual([]);
  });
});

describe('hashtagsFor', () => {
  it('includes the city and never duplicates a tag', () => {
    const tags = hashtagsFor(listing({ city: 'Kandy' }));
    expect(tags).toContain('#Kandy');
    expect(new Set(tags).size).toBe(tags.length);
  });

  it('strips punctuation from multi-word towns', () => {
    const tags = hashtagsFor(listing({ city: 'Dehiwala-Mount Lavinia' }));
    expect(tags).toContain('#DehiwalaMountLavinia');
  });
});
