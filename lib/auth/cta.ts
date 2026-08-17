/**
 * Hrefs for calls-to-action that need an account.
 *
 * The rule these encode: a CTA's job is to get the visitor to the thing. Anyone
 * already signed in should land on it directly — routing them through /sign-up
 * is a dead end, and /sign-in is barely better. Only visitors without a session
 * take the sign-up detour, and the `redirect` carries them back afterwards.
 *
 * The destination frequently has its own query string (e.g. `?mode=quick`), so
 * it MUST be encoded. Raw, everything after its `?` is parsed as parameters of
 * /sign-up, and the destination silently loses them.
 */
export function accountGatedHref(
  isSignedIn: boolean,
  destination: string
): string {
  return isSignedIn
    ? destination
    : `/sign-up?redirect=${encodeURIComponent(destination)}`;
}
