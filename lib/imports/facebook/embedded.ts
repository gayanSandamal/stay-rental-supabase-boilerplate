/**
 * The whole post, out of the JSON Facebook embeds in the same response.
 *
 * `og:description` is cut at about 200 characters, and for a year the importer
 * treated that as the limit of what Facebook sends. It is not. Measured
 * 2026-11-29 on four live posts (three of them GROUP posts): the crawler
 * response carries the post's full `message.text` in its hydration data, some
 * 490-510 KB in — rent, rooms and phone numbers included. Nothing ever read it.
 *
 * THE PREVIEW IS THE KEY. A page also carries other people's posts (a Page's
 * response held seven of them), so "the longest text" would import a stranger's
 * advert. A candidate counts only if it STARTS WITH the preview we were served
 * for this very URL — roughly 200 characters of agreement. No match means the
 * preview stands, exactly as before.
 *
 * Undocumented by Facebook, so this must only ever improve on the preview:
 * every failure here returns null and the importer falls back to it.
 */

const ELLIPSIS = /(?:\.{3}|…)\s*$/;
/** Below this, "starts with the preview" is too weak a claim to act on. */
const MIN_PREVIEW_CHARS = 20;
/** A Facebook post allows 63,206 characters; no rental advert comes close. */
const MAX_POST_CHARS = 20_000;

/** Did Facebook cut this text off? Its previews always end in an ellipsis. */
export function isTruncatedPreview(text: string | null | undefined): boolean {
  return ELLIPSIS.test(text ?? '');
}

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();

/** The complete post text for this preview, or null when it is not there. */
export function embeddedPostText(html: string, preview: string | null): string | null {
  if (!preview || !isTruncatedPreview(preview)) return null;
  const opening = collapse(preview.replace(ELLIPSIS, ''));
  if (opening.length < MIN_PREVIEW_CHARS) return null;

  let best: string | null = null;
  for (const [, raw] of html.matchAll(/"text":"((?:[^"\\]|\\.)*)"/g)) {
    // Escapes only ever make the raw form LONGER, so this cannot drop a match.
    if (raw.length < opening.length) continue;

    let text: string;
    try {
      text = JSON.parse(`"${raw}"`);
    } catch {
      continue;
    }
    if (text.length > MAX_POST_CHARS) continue;

    const flat = collapse(text);
    if (flat.length <= opening.length || !flat.startsWith(opening)) continue;

    // The permalink's own story comes first. A later copy replaces it only when
    // it CONTINUES it — brokers re-post one advert with the same opening and a
    // different rent, and the first is the one the operator asked for.
    if (best === null || (flat.length > collapse(best).length && flat.startsWith(collapse(best.replace(ELLIPSIS, ''))))) {
      best = text;
    }
  }
  return best?.trim() || null;
}
