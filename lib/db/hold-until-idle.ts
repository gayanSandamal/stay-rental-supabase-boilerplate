import { getDeadline, waitUntil } from '@vercel/functions';

/**
 * Keep the current Vercel invocation alive until postgres-js has closed its
 * idle connection, so an instance is never suspended holding a live socket.
 *
 * WHY. On Fluid Compute an instance is suspended as soon as it has no
 * in-flight invocation, and a suspended process cannot run the timer that
 * `idle_timeout` uses to close the socket. The pooler can drop that socket
 * while the instance is frozen; when it thaws, postgres-js still believes the
 * connection is open. A write to a half-open socket succeeds locally, no reply
 * ever comes, and with `max: 1` every later query on that instance queues
 * behind it until the platform kills the request at 300s.
 *
 * That is what took the site down on 2026-09-12 17:28-17:33Z, right after the
 * broker-pivot deploy: `/`, `/back-office` and `/back-office/settings` hung
 * for 300s on one instance, while `/api/user` ran the SAME `SELECT` on `users`
 * successfully from another instance at 17:28:49. Identical code promoted to a
 * fresh instance at 17:37 has served cleanly since, and the same symptom was
 * logged on 2026-06-18 and 2026-09-04, before any of that code existed.
 * `(node) TimeoutNegativeWarning` shows the freezing happens — something
 * computes a delay from a clock that jumped while the instance was frozen —
 * but it is NOT from postgres-js (its timers pass a fixed delay) and it does
 * NOT go away with this fix: freezing an idle instance is normal and fine once
 * its socket has closed. Its presence says nothing about whether this works.
 * A 300s timeout on a DB-backed route is the symptom to watch for.
 *
 * WHY NOT `attachDatabasePool`. It is Vercel's fix for exactly this, and it
 * does exactly what this file does — arm a `waitUntil` for the pool's idle
 * timeout after each use. But it only recognises `pg`, MySQL, MongoDB and
 * Redis pools, and THROWS "Unsupported database pool type" for a postgres-js
 * client (checked against @vercel/functions 3.9.7). Calling it here would
 * crash every request.
 *
 * HOW. drizzle calls `logger.logQuery` before every query it runs — every
 * runtime query in this app goes through `db`; only the scripts in lib/db use
 * the raw client. Each call re-arms ONE shared timer and resolves the previous
 * hold: on a shared Fluid instance only the most recent query decides when
 * the connection goes idle, so only the newest invocation needs to wait.
 *
 * NOT postgres-js's `debug` option, which would be the obvious hook: setting
 * it makes the driver attach `query`, `parameters` and `args` to every error
 * as ENUMERABLE properties (postgres/src/connection.js), so any
 * `console.error(err)` would start printing emails and phone numbers into the
 * production logs.
 *
 * Outside a Vercel request (`next build`, migration scripts, local dev) this
 * does nothing: `VERCEL_REGION` is unset during builds and locally, and
 * `waitUntil` is a no-op without a request context.
 */

/**
 * `logQuery` fires BEFORE the query runs, while the idle timer starts when it
 * FINISHES. The margin covers that gap; a query slower than this at the very
 * end of a burst could still leave a narrow window.
 */
export const IDLE_HOLD_MARGIN_MS = 5_000;

let pending: { timer: ReturnType<typeof setTimeout>; resolve: () => void } | null = null;

export function holdInvocationUntilIdle(
  idleTimeoutSeconds: number,
  now: () => number = Date.now
): void {
  if (!process.env.VERCEL_REGION) return;

  try {
    if (pending) {
      clearTimeout(pending.timer);
      pending.resolve();
      pending = null;
    }

    // Never hold an invocation past its own deadline: a hold is only useful
    // while the invocation is alive, and it must not be what times it out.
    const deadline = getDeadline();
    const remaining = deadline ? deadline.getTime() - now() - 1_000 : Infinity;
    const wait = Math.min(idleTimeoutSeconds * 1_000 + IDLE_HOLD_MARGIN_MS, Math.max(100, remaining));

    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    const timer = setTimeout(() => {
      resolve();
      if (pending?.timer === timer) pending = null;
    }, wait);
    pending = { timer, resolve };

    waitUntil(promise);
  } catch (error) {
    // Connection bookkeeping must never be the thing that fails a query.
    console.error('[db] could not arm idle hold', error);
  }
}

/** Test hook: drop any armed hold. */
export function resetIdleHoldForTests(): void {
  if (pending) {
    clearTimeout(pending.timer);
    pending.resolve();
  }
  pending = null;
}
