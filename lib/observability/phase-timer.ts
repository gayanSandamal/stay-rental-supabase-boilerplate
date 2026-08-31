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
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`[deadline] ${label} exceeded ${ms}ms`)), ms)
    ),
  ]);
}
