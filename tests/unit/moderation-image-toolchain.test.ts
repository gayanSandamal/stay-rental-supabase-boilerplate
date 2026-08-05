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
