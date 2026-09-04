/**
 * Server-side phase timing for diagnosing 300s function timeouts.
 *
 * A Vercel runtime timeout produces no stack and no error — the function simply
 * never returns — so the only way to learn WHICH await hung is to log before
 * and after each one. Every line is prefixed `[phase]` so it can be grepped out
 * of runtime logs.
 */
export async function phase<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  console.log(`[phase] → ${label}`);
  try {
    const result = await fn();
    console.log(`[phase] ✓ ${label} ${Date.now() - started}ms`);
    return result;
  } catch (err) {
    console.error(`[phase] ✗ ${label} ${Date.now() - started}ms`, err);
    throw err;
  }
}

/**
 * Reject rather than hang. An unbounded network call inside a Server Component
 * is indistinguishable from a crash to the user — they get a blank page for
 * five minutes — and it costs a full function invocation.
 */
export function withDeadline<T>(label: string, promise: Promise<T>, ms: number): Promise<T> {
  // The timer is CLEARED once the race settles. Left pending it holds the Node
  // event loop open for the full `ms` after the work is already done, which on
  // a serverless function is billed wall-clock on every single request that
  // calls this — and this one is called on every authenticated render.
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`[deadline] ${label} exceeded ${ms}ms`)),
        ms
      );
    }),
  ]).finally(() => clearTimeout(timer));
}
