import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A moderation run must not be retried forever when it keeps dying.
 *
 * On 2026-10-11 listing #45 was claimed 64 times and finished ONCE: every other
 * run went past Vercel's 60s `maxDuration` while waiting on a slow provider and
 * was killed before it could write a result. The attempt cap was only checked
 * by a run that survived, so the lease expired, the row was claimed again five
 * minutes later, and so on for five hours — #42 did the same 35 times.
 *
 * Two fixes, two halves of this file:
 *   1. provider calls respect a hard deadline, so a run finishes and records;
 *   2. a lease-expired row already at the cap is held, not claimed again.
 */

// ---------------------------------------------------------------- chatJson --

describe('chatJson deadline', () => {
  const originalKey = process.env.SILICONFLOW_API_KEY;

  beforeEach(() => {
    process.env.SILICONFLOW_API_KEY = 'test-key';
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.SILICONFLOW_API_KEY;
    else process.env.SILICONFLOW_API_KEY = originalKey;
  });

  async function load() {
    const { chatJson } = await import('@/lib/moderation/client');
    return chatJson;
  }

  it('does not call the provider at all when too little time is left', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const chatJson = await load();

    const res = await chatJson({ model: 'm', system: 's', user: 'u', deadline: Date.now() + 1000 });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.error).toBe('out_of_time');
  });

  it('gives an attempt only the time that is left, never the full 25s', async () => {
    const timeouts: number[] = [];
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
      timeouts.push(ms);
      return realTimeout(ms);
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const err = new Error('timed out');
        err.name = 'TimeoutError';
        throw err;
      })
    );
    const chatJson = await load();

    // 10s left: the first attempt gets <= 10s. After it fails and the 800ms
    // pause, ~9s remain, so the retry is made, also capped by what is left.
    const res = await chatJson({ model: 'm', system: 's', user: 'u', deadline: Date.now() + 10_000 });

    expect(res.error).toBe('timeout');
    expect(timeouts.length).toBe(2);
    for (const ms of timeouts) expect(ms).toBeLessThanOrEqual(10_000);
  });

  it('skips the retry when the first attempt used up the clock', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const err = new Error('timed out');
        err.name = 'TimeoutError';
        throw err;
      })
    );
    const chatJson = await load();
    // 4.5s left: the first attempt runs; after the 800ms pause < 4s remain.
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

    const res = await chatJson({ model: 'm', system: 's', user: 'u', deadline: Date.now() + 4_500 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The first attempt's real error is reported, not a made-up out_of_time.
    expect(res.error).toBe('timeout');
  });

  it('without a deadline behaves as before (two attempts at the full timeout)', async () => {
    const timeouts: number[] = [];
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
      timeouts.push(ms);
      return realTimeout(ms);
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNRESET');
      })
    );
    const chatJson = await load();

    const res = await chatJson({ model: 'm', system: 's', user: 'u' });

    expect(res.error).toMatch(/^network:/);
    expect(timeouts).toEqual([25_000, 25_000]);
  });
});

// -------------------------------------------------------- source contracts --

function code(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function fnBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}(`);
  expect(start, `${name} must exist`).toBeGreaterThanOrEqual(0);
  const next = src.indexOf('\nexport ', start + 1);
  return src.slice(start, next === -1 ? undefined : next);
}

describe('killed runs are capped', () => {
  const engine = code('lib/moderation/engine.ts');

  it('claimListings never re-claims a lease-expired row that is at the cap', () => {
    const claim = fnBody(engine, 'claimListings');
    expect(claim).toMatch(
      /moderation_status = 'running'\s+AND moderation_lease_until < now\(\)\s+AND moderation_attempts < \$\{MODERATION_MAX_ATTEMPTS\}/
    );
  });

  it('holdAbandonedRuns holds exactly those rows, and leaves listing status alone', () => {
    const hold = fnBody(engine, 'holdAbandonedRuns');
    expect(hold).toContain("moderation_status = 'held'");
    expect(hold).toContain('moderation_lease_until = NULL');
    expect(hold).toMatch(/WHERE moderation_status = 'running'\s+AND moderation_lease_until < now\(\)\s+AND moderation_attempts >= \$\{MODERATION_MAX_ATTEMPTS\}/);
    // I7: a live listing must not go dark because our checks could not run.
    expect(hold).not.toMatch(/\bstatus\s*=\s*'(pending|archived|rejected)'/);
  });

  it('the sweep holds abandoned runs BEFORE it claims, and tells ops', () => {
    const sweep = fnBody(engine, 'sweepModerationQueue');
    const hold = sweep.indexOf('holdAbandonedRuns()');
    const claim = sweep.indexOf('claimListings(');
    expect(hold).toBeGreaterThanOrEqual(0);
    expect(claim).toBeGreaterThan(hold);
    expect(sweep.slice(hold, claim)).toContain('createNotificationsForOpsAndAdmin(');
  });

  it('a budget release gives back the attempt the claim counted', () => {
    const sweep = fnBody(engine, 'sweepModerationQueue');
    const release = sweep.slice(sweep.indexOf('MODERATION_RUN_BUDGET_MS) {'));
    expect(release.slice(0, 900)).toMatch(/moderationAttempts:\s*sql`greatest\(\$\{listings\.moderationAttempts\} - 1, 0\)`/);
  });

  it('the sweep passes the hard deadline down to every provider call', () => {
    const sweep = fnBody(engine, 'sweepModerationQueue');
    expect(sweep).toMatch(/moderateListing\(\s*listing,\s*started \+ MODERATION_RUN_BUDGET_MS,\s*started \+ MODERATION_HARD_DEADLINE_MS\s*\)/);
    const moderate = fnBody(engine, 'moderateListing');
    expect(moderate).toMatch(/checkImage\(\{[\s\S]*?deadline: hardDeadline/);
    expect(moderate).toMatch(/checkText\([\s\S]*?\{ deadline: hardDeadline \}\)/);
    for (const file of ['lib/moderation/image-check.ts', 'lib/moderation/text-check.ts']) {
      const src = code(file);
      const calls = src.match(/chatJson<\w+>\(\{[\s\S]*?\}\);/g) ?? [];
      expect(calls.length).toBeGreaterThan(0);
      for (const c of calls) expect(c, `${file}: every chatJson call takes the deadline`).toMatch(/deadline:/);
    }
  });

  it('the hard deadline leaves room under Vercel’s 60s for the write and notices', async () => {
    const { MODERATION_HARD_DEADLINE_MS, MODERATION_RUN_BUDGET_MS } = await import('@/lib/moderation/config');
    expect(MODERATION_HARD_DEADLINE_MS).toBeGreaterThan(MODERATION_RUN_BUDGET_MS);
    expect(MODERATION_HARD_DEADLINE_MS).toBeLessThanOrEqual(50_000);
  });
});
