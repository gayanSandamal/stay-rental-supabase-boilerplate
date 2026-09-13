import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IDLE_HOLD_MARGIN_MS,
  holdInvocationUntilIdle,
  resetIdleHoldForTests,
} from '@/lib/db/hold-until-idle';

/**
 * lib/db/hold-until-idle.ts keeps a Vercel invocation alive until postgres-js
 * has closed its idle socket, so an instance is never suspended holding one
 * (the 2026-09-12 outage). These tests fake the request context the Vercel
 * runtime installs, which is all `waitUntil` / `getDeadline` read.
 */

const CONTEXT = Symbol.for('@vercel/request-context');

type Hold = { settled: boolean };

function installContext(deadline?: number) {
  const holds: Hold[] = [];
  (globalThis as any)[CONTEXT] = {
    get: () => ({
      deadline,
      waitUntil: (p: Promise<unknown>) => {
        const hold: Hold = { settled: false };
        holds.push(hold);
        p.then(() => {
          hold.settled = true;
        });
      },
    }),
  };
  return holds;
}

/** Let `.then` callbacks on already-resolved promises run. */
const flush = () => Promise.resolve().then(() => Promise.resolve());

describe('holdInvocationUntilIdle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('VERCEL_REGION', 'sin1');
  });

  afterEach(() => {
    resetIdleHoldForTests();
    delete (globalThis as any)[CONTEXT];
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('does nothing outside a Vercel runtime (builds, scripts, local dev)', () => {
    vi.stubEnv('VERCEL_REGION', '');
    const holds = installContext();
    holdInvocationUntilIdle(30);
    expect(holds).toHaveLength(0);
  });

  it('holds the invocation until the idle timeout plus margin has passed', async () => {
    const holds = installContext();
    holdInvocationUntilIdle(30);
    expect(holds).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(30_000 + IDLE_HOLD_MARGIN_MS - 1);
    await flush();
    expect(holds[0].settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(holds[0].settled).toBe(true);
  });

  it('releases the previous hold as soon as a newer query re-arms it', async () => {
    // On a shared Fluid instance only the latest query decides when the
    // connection goes idle, so an older invocation must not be kept waiting.
    const holds = installContext();
    holdInvocationUntilIdle(30);
    await vi.advanceTimersByTimeAsync(5_000);
    holdInvocationUntilIdle(30);
    await flush();

    expect(holds).toHaveLength(2);
    expect(holds[0].settled).toBe(true);
    expect(holds[1].settled).toBe(false);
  });

  it('never holds an invocation past its own deadline', async () => {
    const start = Date.now();
    const holds = installContext(start + 10_000);
    holdInvocationUntilIdle(30, () => start);

    // deadline - now - 1s safety = 9s, well under 35s.
    await vi.advanceTimersByTimeAsync(9_000);
    await flush();
    expect(holds[0].settled).toBe(true);
  });

  it('is a silent no-op when there is no request context', () => {
    expect(() => holdInvocationUntilIdle(30)).not.toThrow();
  });
});

describe('lib/db/drizzle.ts wiring', () => {
  const source = readFileSync(join(process.cwd(), 'lib/db/drizzle.ts'), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('arms the hold from the drizzle logger with the same idle timeout as the pool', () => {
    expect(source).toContain('idle_timeout: IDLE_TIMEOUT_SECONDS');
    expect(source).toContain('holdInvocationUntilIdle(IDLE_TIMEOUT_SECONDS)');
  });

  it('never sets postgres-js `debug`, which would put query parameters in error logs', () => {
    expect(source).not.toMatch(/\bdebug\s*:/);
  });

  it('does not call attachDatabasePool, which throws for postgres-js clients', () => {
    expect(source).not.toContain('attachDatabasePool');
  });
});
