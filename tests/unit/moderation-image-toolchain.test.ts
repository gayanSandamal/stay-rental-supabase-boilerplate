import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Regression cover for the failure that shipped: sharp could not load in the
 * deployed function, and BOTH sharp call sites swallowed it. Photos were
 * published unprocessed (no watermark, EXIF intact) and every image silently
 * auto-PASSED the vision check while the ledger recorded it as checked.
 *
 * The contract these tests pin down:
 *   dead toolchain   → transport error → caller fails closed (nothing unchecked
 *                      reaches the public site)
 *   one bad image    → soft skip, listing unaffected
 * Conflating the two is the bug.
 */

const loadSharp = vi.hoisted(() => vi.fn());

vi.mock('@/lib/images/process', async () => {
  // The real error class is kept — `instanceof` is the discriminator under test.
  const actual = await vi.importActual<typeof import('@/lib/images/process')>('@/lib/images/process');
  return { ...actual, loadSharp };
});

// image-check reads/writes a verdict cache; irrelevant here and must not need a DB.
vi.mock('@/lib/db/drizzle', () => ({
  db: {
    query: { imageModerationCache: { findFirst: vi.fn(async () => undefined) } },
    insert: () => ({ values: () => ({ onConflictDoNothing: async () => undefined }) }),
  },
}));

const chatJson = vi.hoisted(() => vi.fn());
vi.mock('@/lib/moderation/client', () => ({ chatJson }));

import { ImageToolchainUnavailableError } from '@/lib/images/process';
import { checkImage } from '@/lib/moderation/image-check';

const ARGS = {
  originalUrl: 'https://example.test/storage/whatsapp-intake/photo.jpeg',
  contentHash: 'a'.repeat(64),
  bytes: Buffer.from('not really an image'),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('checkImage when the image toolchain is dead', () => {
  it('reports a transport error instead of a silent pass', async () => {
    loadSharp.mockRejectedValue(new ImageToolchainUnavailableError(new Error('ERR_DLOPEN_FAILED')));

    const outcome = await checkImage(ARGS);

    // This is the load-bearing assertion. `error` is what the engine turns into
    // `providerError`, which makes combine() fail closed and hold the listing.
    expect(outcome.error).toBe('image_toolchain_unavailable');
    expect(chatJson).not.toHaveBeenCalled();
  });

  it('never reaches the model, so it cannot poison the verdict cache', async () => {
    loadSharp.mockRejectedValue(new ImageToolchainUnavailableError(new Error('boom')));
    await checkImage(ARGS);
    // A cached `pass` keyed on content hash would outlive the broken deploy and
    // permanently exempt these photos from checking.
    expect(chatJson).not.toHaveBeenCalled();
  });
});

describe('checkImage when a single image cannot be decoded', () => {
  it('skips that photo softly and does NOT flag the provider', async () => {
    // A working sharp that rejects this particular buffer — a format quirk, not
    // an outage. Holding the whole listing over one odd file helps nobody.
    loadSharp.mockResolvedValue(() => {
      throw new Error('Input buffer contains unsupported image format');
    });

    const outcome = await checkImage(ARGS);

    expect(outcome.error).toBeNull();
    expect(outcome.verdict.verdict).toBe('pass');
    expect(chatJson).not.toHaveBeenCalled();
  });
});

describe('checkImage when the adjudicator runs out of time', () => {
  it('returns out_of_time and does NOT cache the unadjudicated "text was added" verdict', async () => {
    // A working sharp: the chain returns itself, toBuffer yields bytes.
    const chain: any = {
      rotate: () => chain,
      resize: () => chain,
      jpeg: () => chain,
      toBuffer: async () => Buffer.from('jpeg'),
    };
    loadSharp.mockResolvedValue(() => chain);
    // The gate claims overlay text, which always escalates to the adjudicator…
    chatJson.mockResolvedValueOnce({
      data: { overlay_text: true, overlay_text_sample: 'Call 0771234567', is_property_photo: true },
      usage: { inputTokens: 1, outputTokens: 1 },
      error: null,
    });
    // …and the run's clock runs out before the adjudicator can answer.
    chatJson.mockResolvedValueOnce({ data: null, usage: { inputTokens: 0, outputTokens: 0 }, error: 'out_of_time' });

    const { db } = await import('@/lib/db/drizzle');
    const insert = vi.spyOn(db as any, 'insert');

    const outcome = await checkImage({ ...ARGS, deadline: Date.now() + 30_000 });

    expect(outcome.error).toBe('out_of_time');
    // A cached reject would permanently drop a photo nobody finished judging.
    expect(insert).not.toHaveBeenCalled();
    expect(chatJson).toHaveBeenCalledTimes(2);
    for (const call of chatJson.mock.calls) expect(call[0].deadline).toBeTypeOf('number');
  });
});
