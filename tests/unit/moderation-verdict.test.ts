import { describe, expect, it } from 'vitest';
import { combine, nextListingStatus, summarize } from '@/lib/moderation/verdict';
import type { ImageVerdict, ModerationPolicy, TextVerdict } from '@/lib/moderation/types';

/** The whole policy matrix from the plan, as a table. No I/O anywhere. */

const POLICY: ModerationPolicy = {
  moderateImages: true,
  moderateTextCoherence: true,
  holdOnUnsafeImages: true,
  failOpen: false,
  maxImages: 6,
};

const okText: TextVerdict = {
  language: 'en',
  languageSupported: true,
  titleCoherent: true,
  locationCoherent: true,
  looksLikeRental: true,
  reasons: [],
  deterministicNotes: [],
};

const img = (url: string, over: Partial<ImageVerdict> = {}): ImageVerdict => ({
  originalUrl: url,
  contentHash: `h-${url}`,
  verdict: 'pass',
  reasons: [],
  fromCache: false,
  ...over,
});

const call = (over: Partial<Parameters<typeof combine>[0]> = {}) =>
  combine({
    text: okText,
    images: [],
    policy: POLICY,
    model: 'Qwen/Qwen3-VL-8B-Instruct',
    promptVersion: 1,
    usage: { inputTokens: 10, outputTokens: 5 },
    durationMs: 1234,
    ...over,
  });

describe('combine — happy path', () => {
  it('passes a clean listing and keeps every photo', () => {
    const v = call({ images: [img('a'), img('b')] });
    expect(v.outcome).toBe('passed');
    expect(v.keptUrls).toEqual(['a', 'b']);
    expect(v.droppedUrls).toEqual([]);
    expect(v.landlordReasons).toEqual([]);
  });

  it('passes a listing with no photos at all', () => {
    expect(call({ images: [] }).outcome).toBe('passed');
  });
});

describe('combine — cosmetic image failures drop the photo and publish the rest', () => {
  it('drops one bad photo of three', () => {
    const v = call({
      images: [
        img('a'),
        img('b', { verdict: 'reject', severity: 'cosmetic', reasons: ['someone is visible in it'] }),
        img('c'),
      ],
    });
    expect(v.outcome).toBe('passed');
    expect(v.keptUrls).toEqual(['a', 'c']);
    expect(v.droppedUrls).toEqual(['b']);
    expect(v.landlordReasons.join(' ')).toContain('someone is visible');
  });

  it('publishes with no photos when all of them are cosmetically rejected', () => {
    const v = call({
      images: [
        img('a', { verdict: 'reject', severity: 'cosmetic', reasons: ["another company's watermark"] }),
      ],
    });
    expect(v.outcome).toBe('passed');
    expect(v.keptUrls).toEqual([]);
    expect(v.reasons.join(' ')).toContain('without photos');
  });

  it('keeps previously published photos when a newly added one is rejected', () => {
    const v = call({
      images: [img('new', { verdict: 'reject', severity: 'cosmetic', reasons: ['text added'] })],
      existingKeptUrls: ['old1', 'old2'],
    });
    expect(v.outcome).toBe('passed');
    expect(v.keptUrls).toEqual(['old1', 'old2']);
  });

  it('pluralises the sender message correctly', () => {
    const one = call({ images: [img('a', { verdict: 'reject', severity: 'cosmetic', reasons: ['r'] })] });
    expect(one.landlordReasons[0]).toContain('1 photo ');
    const two = call({
      images: [
        img('a', { verdict: 'reject', severity: 'cosmetic', reasons: ['r'] }),
        img('b', { verdict: 'reject', severity: 'cosmetic', reasons: ['r'] }),
      ],
    });
    expect(two.landlordReasons[0]).toContain('2 photos ');
  });
});

describe('combine — safety failures hold the whole listing', () => {
  it('holds when any photo is unsafe', () => {
    const v = call({
      images: [img('a'), img('bad', { verdict: 'reject', severity: 'safety', reasons: ['content rules'] })],
    });
    expect(v.outcome).toBe('held');
    expect(v.keptUrls).toEqual([]);
  });

  it('never tells the sender what tripped the safety filter', () => {
    const v = call({
      images: [img('bad', { verdict: 'reject', severity: 'safety', reasons: ['nudity'] })],
    });
    expect(v.landlordReasons.join(' ')).not.toMatch(/nudity|violence|unsafe/i);
    expect(v.landlordReasons.join(' ')).toContain('reviewing your listing');
  });

  it('downgrades to a drop when holdOnUnsafeImages is off', () => {
    const v = call({
      images: [img('a'), img('bad', { verdict: 'reject', severity: 'safety', reasons: ['x'] })],
      policy: { ...POLICY, holdOnUnsafeImages: false },
    });
    expect(v.outcome).toBe('passed');
    expect(v.keptUrls).toEqual(['a']);
  });
});

describe('combine — text failures hold', () => {
  it('holds an unsupported language', () => {
    const v = call({ text: { ...okText, language: 'other:Hindi', languageSupported: false } });
    expect(v.outcome).toBe('held');
    expect(v.reasons.join(' ')).toContain('Unsupported language');
  });

  it('holds text that is not a rental listing', () => {
    const v = call({ text: { ...okText, looksLikeRental: false, reasons: ['investment pitch'] } });
    expect(v.outcome).toBe('held');
  });

  it('holds a title/description mismatch', () => {
    const v = call({ text: { ...okText, titleCoherent: false, reasons: ['title says 3BR, body says single room'] } });
    expect(v.outcome).toBe('held');
    expect(v.reasons.join(' ')).toContain('mismatch');
  });

  it('holds an incoherent location', () => {
    const v = call({ text: { ...okText, locationCoherent: false, reasons: ['city in another district'] } });
    expect(v.outcome).toBe('held');
  });

  it('ignores text problems entirely when text moderation is disabled', () => {
    const v = call({
      text: { ...okText, titleCoherent: false, languageSupported: false, language: 'other:Hindi' },
      policy: { ...POLICY, moderateTextCoherence: false },
    });
    expect(v.outcome).toBe('passed');
  });

  it('safety beats text: an unsafe photo holds before any text reason is considered', () => {
    const v = call({
      text: { ...okText, languageSupported: false, language: 'other:Hindi' },
      images: [img('bad', { verdict: 'reject', severity: 'safety', reasons: ['x'] })],
    });
    expect(v.outcome).toBe('held');
    expect(v.reasons.join(' ')).toContain('unsafe');
  });
});

describe('combine — provider failure', () => {
  it('fails closed by default (error, nothing published)', () => {
    const v = call({ providerError: 'timeout', images: [img('a')] });
    expect(v.outcome).toBe('error');
    expect(v.keptUrls).toEqual([]);
    expect(v.errorMessage).toBe('timeout');
    expect(v.landlordReasons).toEqual([]);
  });

  it('publishes when failOpen is on, as the emergency valve', () => {
    const v = call({
      providerError: 'http_529',
      images: [img('a'), img('b')],
      policy: { ...POLICY, failOpen: true },
    });
    expect(v.outcome).toBe('passed');
    expect(v.keptUrls).toEqual(['a', 'b']);
    expect(v.reasons.join(' ')).toContain('fail-open');
  });

  it('preserves already-published photos on a failure during an edit', () => {
    const v = call({ providerError: 'timeout', images: [img('new')], existingKeptUrls: ['old'] });
    expect(v.keptUrls).toEqual(['old']);
  });
});

describe('summarize', () => {
  it('describes each outcome briefly', () => {
    expect(summarize(call({ images: [img('a')] }))).toBe('Passed all checks');
    expect(
      summarize(call({ images: [img('a', { verdict: 'reject', severity: 'cosmetic', reasons: ['r'] })] }))
    ).toContain('1 photo(s) dropped');
    expect(summarize(call({ text: { ...okText, languageSupported: false } }))).toContain('Unsupported');
    expect(summarize(call({ providerError: 'timeout' }))).toContain('Moderation error');
  });

  it('surfaces photos published unprocessed', () => {
    // The one symptom of a broken image pipeline that ops actually read. Without
    // this, a systematic compress/watermark failure is only visible by decoding
    // photos_manifest by hand and noticing `p === o`.
    const v = { ...call({ images: [img('a')] }), processingFallbacks: 3 };
    expect(summarize(v)).toContain('3 unprocessed');
  });

  it('never exceeds the column-friendly length', () => {
    const long = 'x'.repeat(500);
    const v = call({ text: { ...okText, titleCoherent: false, reasons: [long] } });
    expect(summarize(v).length).toBeLessThanOrEqual(200);
  });
});

describe('combine — holdReason tags every hold path', () => {
  it('unsafe imagery', () => {
    const v = call({
      images: [img('a', { verdict: 'reject', severity: 'safety', reasons: ['nudity'] })],
    });
    expect(v.outcome).toBe('held');
    expect(v.holdReason).toBe('unsafe_image');
  });

  it('unsupported language', () => {
    const v = call({ text: { ...okText, languageSupported: false, language: 'fr' } });
    expect(v.holdReason).toBe('language');
  });

  it('not a rental', () => {
    const v = call({ text: { ...okText, looksLikeRental: false } });
    expect(v.holdReason).toBe('not_rental');
  });

  it('incoherent title or location', () => {
    expect(call({ text: { ...okText, titleCoherent: false } }).holdReason).toBe('incoherent');
    expect(call({ text: { ...okText, locationCoherent: false } }).holdReason).toBe('incoherent');
  });

  it('is absent when nothing is held', () => {
    expect(call({ images: [img('a')] }).holdReason).toBeUndefined();
  });
});

describe('combine — over-cap photos', () => {
  it('are dropped and explained without holding the listing', () => {
    const v = call({ images: [img('a')], cappedOutUrls: ['x', 'y'] });
    expect(v.outcome).toBe('passed');
    expect(v.holdReason).toBeUndefined();
    expect(v.droppedUrls).toEqual(['x', 'y']);
    // The landlord is actually told — the old code appended this after
    // combine() returned, so the message never reached them.
    expect(v.landlordReasons.join(' ')).toMatch(/6 photos per listing/);
    expect(v.landlordReasons.join(' ')).toMatch(/swap/i);
  });

  it('are still reported as dropped when the listing is held for another reason', () => {
    const v = call({ text: { ...okText, looksLikeRental: false }, cappedOutUrls: ['x'] });
    expect(v.outcome).toBe('held');
    expect(v.droppedUrls).toEqual(['x']);
  });

  it('says "one" for a single leftover', () => {
    const v = call({ cappedOutUrls: ['x'] });
    expect(v.landlordReasons.join(' ')).toMatch(/last one wasn/);
  });
});

describe('nextListingStatus — a re-check may only take a live listing dark for safety', () => {
  const verdict = (over: Partial<Parameters<typeof combine>[0]> = {}) => call(over);

  it('publishes a fresh pass when auto-publish is on', () => {
    expect(
      nextListingStatus({ wasLive: false, verdict: verdict(), autoPublish: true })
    ).toBe('active');
  });

  it('parks a fresh pass for review when auto-publish is off', () => {
    expect(
      nextListingStatus({ wasLive: false, verdict: verdict(), autoPublish: false })
    ).toBe('pending');
  });

  it('leaves a live listing alone on a text hold', () => {
    const v = verdict({ text: { ...okText, titleCoherent: false } });
    expect(nextListingStatus({ wasLive: true, verdict: v, autoPublish: true })).toBeNull();
  });

  it('takes a live listing dark on unsafe imagery', () => {
    const v = verdict({
      images: [img('a', { verdict: 'reject', severity: 'safety', reasons: ['nudity'] })],
    });
    expect(nextListingStatus({ wasLive: true, verdict: v, autoPublish: true })).toBe('pending');
  });

  it('keeps a held first-time listing unpublished', () => {
    const v = verdict({ text: { ...okText, looksLikeRental: false } });
    expect(nextListingStatus({ wasLive: false, verdict: v, autoPublish: true })).toBe('pending');
  });

  it('has no opinion when the run errored', () => {
    const v = verdict({ providerError: 'timeout' });
    expect(v.outcome).toBe('error');
    expect(nextListingStatus({ wasLive: true, verdict: v, autoPublish: true })).toBeNull();
    expect(nextListingStatus({ wasLive: false, verdict: v, autoPublish: true })).toBeNull();
  });

  it('keeps a live listing live when it passes', () => {
    expect(
      nextListingStatus({ wasLive: true, verdict: verdict(), autoPublish: false })
    ).toBe('active');
  });
});
