import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Search impressions (migration 0048).
 *
 * The constraint that shapes this whole module: NEVER a row per listing per
 * search. Twenty results on the most-hit query in the product would be twenty
 * inserts on the critical path of a `max: 1` pool. So the counting path must be
 * synchronous and in memory, and the write must be one batched upsert.
 */

const insert = vi.fn();
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/drizzle', () => ({
  db: {
    insert: (...args: unknown[]) => insert(...args),
  },
}));

const afterCalls: (() => unknown)[] = [];
vi.mock('next/server', () => ({
  after: (fn: () => unknown) => {
    afterCalls.push(fn);
  },
}));

const {
  recordImpressions,
  shouldFlushImpressions,
  flushImpressions,
  bufferedImpressionRows,
  trackImpressions,
} = await import('@/lib/analytics/impressions');

/** A chainable stand-in for the drizzle insert builder. */
function okInsert() {
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate: vi.fn().mockResolvedValue([]) });
  insert.mockReturnValue({ values });
  return values;
}

function failingInsert() {
  const values = vi.fn().mockReturnValue({
    onConflictDoUpdate: vi.fn().mockRejectedValue(new Error('connection wedged')),
  });
  insert.mockReturnValue({ values });
  return values;
}

beforeEach(async () => {
  // Drain whatever a previous test left buffered.
  okInsert();
  await flushImpressions();
  insert.mockReset();
  afterCalls.length = 0;
  vi.restoreAllMocks();
});

const DAY = new Date('2026-08-31T12:00:00Z');

describe('the counting path', () => {
  it('collapses repeat impressions into one row per listing per day', () => {
    recordImpressions([1, 2, 3], DAY);
    recordImpressions([1, 2, 3], DAY);
    recordImpressions([1], DAY);
    expect(bufferedImpressionRows()).toBe(3);
  });

  it('touches the database not at all while counting', () => {
    recordImpressions([1, 2, 3], DAY);
    expect(insert).not.toHaveBeenCalled();
  });

  it('splits a day boundary into separate rows', () => {
    recordImpressions([1], new Date('2026-08-31T23:00:00Z'));
    recordImpressions([1], new Date('2026-09-01T01:00:00Z'));
    expect(bufferedImpressionRows()).toBe(2);
  });

  it('ignores an empty result page', () => {
    recordImpressions([], DAY);
    expect(bufferedImpressionRows()).toBe(0);
    expect(shouldFlushImpressions()).toBe(false);
  });
});

describe('the flush', () => {
  it('writes ONE batch, not one row per listing', async () => {
    recordImpressions([1, 2, 3], DAY);
    recordImpressions([1, 2, 3], DAY);
    const values = okInsert();

    const result = await flushImpressions();

    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledTimes(1);
    expect(values.mock.calls[0][0]).toHaveLength(3);
    expect(result).toEqual({ rows: 3, impressions: 6 });
    expect(bufferedImpressionRows()).toBe(0);
  });

  it('is a no-op on an empty buffer', async () => {
    okInsert();
    expect(await flushImpressions()).toEqual({ rows: 0, impressions: 0 });
    expect(insert).not.toHaveBeenCalled();
  });

  /*
   * A dropped batch is a silent, permanent undercount — and the upsert ADDS
   * rather than replaces, so returning the counts to the buffer is safe.
   */
  it('returns the counts to the buffer when the write fails', async () => {
    recordImpressions([1, 2], DAY);
    failingInsert();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await flushImpressions();

    expect(result).toEqual({ rows: 0, impressions: 0 });
    expect(bufferedImpressionRows()).toBe(2);

    const values = okInsert();
    await flushImpressions();
    expect(values.mock.calls[0][0]).toHaveLength(2);
  });

  it('does not flush on every search', () => {
    recordImpressions([1, 2, 3], DAY);
    expect(shouldFlushImpressions(DAY)).toBe(false);
  });

  it('flushes once the batch is big enough to be worth a round trip', () => {
    recordImpressions(
      Array.from({ length: 300 }, (_, i) => i + 1),
      DAY
    );
    expect(shouldFlushImpressions(DAY)).toBe(true);
  });

  it('flushes once counts have sat in memory long enough to be worth losing', () => {
    recordImpressions([1], DAY);
    expect(shouldFlushImpressions(DAY)).toBe(false);
    expect(shouldFlushImpressions(new Date(DAY.getTime() + 61_000))).toBe(true);
  });
});

describe('trackImpressions', () => {
  it('counts without scheduling anything while the buffer is young', () => {
    trackImpressions([1, 2, 3]);
    expect(afterCalls).toHaveLength(0);
    expect(bufferedImpressionRows()).toBe(3);
  });

  /*
   * `after()` runs the flush once the response has gone out AND on the instance
   * holding the buffer. A cron would land on an arbitrary instance and find an
   * empty map; a bare detached promise can be killed when the invocation ends.
   */
  it('defers the flush past the response once the batch is large', async () => {
    trackImpressions(Array.from({ length: 300 }, (_, i) => i + 1));
    expect(afterCalls).toHaveLength(1);
    expect(insert).not.toHaveBeenCalled();

    const values = okInsert();
    await afterCalls[0]();
    expect(values).toHaveBeenCalledTimes(1);
  });
});
