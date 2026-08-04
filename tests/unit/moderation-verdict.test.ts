import { describe, expect, it } from 'vitest';
import { combine, summarize } from '@/lib/moderation/verdict';
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

  it('never exceeds the column-friendly length', () => {
    const long = 'x'.repeat(500);
    const v = call({ text: { ...okText, titleCoherent: false, reasons: [long] } });
    expect(summarize(v).length).toBeLessThanOrEqual(200);
  });
});
