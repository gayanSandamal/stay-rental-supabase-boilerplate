/**
 * The Facebook link we hand a landlord (and ops) for a Page post.
 *
 * A Page answers to THREE ids, and only one of them makes a post link that
 * opens everywhere:
 *
 *   FACEBOOK_PAGE_ID           1229347226919525   what Graph publishes with;
 *                                                 post ids come back as
 *                                                 `{this}_{story-id}`
 *   permalink_url's lead id    122111970747369710 what Graph's `permalink_url`
 *                                                 has returned since ~Oct 2026
 *   the Page's public profile  61591091318155     what facebook.com itself
 *                                                 advertises as `og:url` /
 *                                                 `rel=canonical`
 *
 * Measured 2026-11-05 against listing #47's live post
 * (story 122122631871369710), iPhone UA, logged out:
 *
 *   /1229347226919525_{story}               → "Log in to Facebook"
 *   /122111970747369710                     → a bare "Facebook" shell; the id
 *                                             resolves to nothing, which is why
 *                                             the app says "This isn't
 *                                             available" and logged-in mobile
 *                                             web fails with it
 *   /122111970747369710/posts/{story}       → renders logged out only; mobile
 *                                             web rewrites it to
 *                                             story.php?id=122111970747369710
 *   /61591091318155/posts/{story}           → the post, and every variant of
 *                                             the URL names this id as
 *                                             canonical
 *
 * Until ~Oct 2026 `permalink_url` WAS the canonical form (see
 * tests/unit/social-facebook-permalink.test.ts — listing #26's link had the
 * 61591091318155 id in it). Meta changed what it returns without changing the
 * field name, so we no longer take its lead id on trust: we keep the story id
 * from it and put the Page's public id in front.
 *
 * Where the public id comes from, in order:
 *   1. FACEBOOK_PAGE_PUBLIC_ID — deterministic, and the only source a render
 *      ever uses (pages never call a platform — see the view-count rules in
 *      CLAUDE.md).
 *   2. Graph `GET /{FACEBOOK_PAGE_ID}?fields=link`, asked from the publish and
 *      notify crons only, cached per instance.
 * With neither, Graph's own `permalink_url` is kept as-is — still the best link
 * we have, and nothing here may manufacture one from FACEBOOK_PAGE_ID alone.
 */

import { isFacebookPageConfigured, socialConfig } from './config';
import { graphGet } from './adapters/graph';
import { isDryRunPost } from './types';

const FACEBOOK_ORIGIN = 'https://www.facebook.com';
const FACEBOOK_HOSTS = new Set(['facebook.com', 'www.facebook.com', 'm.facebook.com']);
const NUMERIC_ID = /^\d{5,25}$/;
/** Facebook usernames: letters, digits and dots, at least five characters. */
const VANITY = /^[A-Za-z0-9.]{5,50}$/;
/** First path segments that are routes, never a Page's username. */
const RESERVED_SEGMENTS = new Set([
  'groups',
  'login',
  'p',
  'pages',
  'people',
  'permalink.php',
  'photo',
  'photo.php',
  'profile.php',
  'share',
  'story.php',
  'watch',
]);

/**
 * Make Graph's `permalink_url` absolute. Returns null when there is nothing
 * usable — never a guess, and never a bare id (the composite
 * `{pageId}_{story}` looks link-ish and is not).
 */
export function normalizeFacebookPermalink(raw: string | null | undefined): string | null {
  const url = (raw ?? '').trim();
  if (!url) return null;
  if (url.startsWith('/')) return `${FACEBOOK_ORIGIN}${url}`;
  return /^https?:\/\//i.test(url) ? url : null;
}

/**
 * The post's story id: the part after the underscore in Graph's composite post
 * id, or failing that whatever the permalink carries.
 */
export function facebookStoryId(
  permalink: string | null | undefined,
  remotePostId: string | null | undefined
): string | null {
  if (remotePostId && !isDryRunPost(remotePostId)) {
    const m = /^\d+_(\d+)$/.exec(remotePostId.trim());
    if (m) return m[1];
  }
  const url = normalizeFacebookPermalink(permalink);
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const fromQuery = parsed.searchParams.get('story_fbid');
  if (fromQuery && NUMERIC_ID.test(fromQuery)) return fromQuery;
  // /{id}/posts/{story} and the slugged /{id}/posts/{slug}/{story}/
  const m = /\/posts\/(?:[^/]+\/)?(\d{5,25})\/?$/.exec(parsed.pathname);
  return m ? m[1] : null;
}

/**
 * The Page's public id (or username) out of a facebook.com Page URL, as Graph's
 * `link` field returns it. Null for anything that is not unmistakably a Page.
 */
export function parseFacebookPageRef(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  // A bare id or username — the shape FACEBOOK_PAGE_PUBLIC_ID is documented in.
  if (!value.includes('/')) {
    return NUMERIC_ID.test(value) || VANITY.test(value) ? value : null;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(parsed.protocol) || !FACEBOOK_HOSTS.has(parsed.hostname.toLowerCase())) {
    return null;
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments[0] === 'profile.php') {
    const id = parsed.searchParams.get('id') ?? '';
    return NUMERIC_ID.test(id) ? id : null;
  }
  // /p/Easy-Rent-61591091318155/ — the id is the slug's last dash-part.
  if (segments[0] === 'p' && segments.length >= 2) {
    const id = segments[1].split('-').pop() ?? '';
    return NUMERIC_ID.test(id) ? id : null;
  }
  // /pages/Easy-Rent/61591091318155
  if (segments[0] === 'pages' && segments.length >= 3) {
    return NUMERIC_ID.test(segments[2]) ? segments[2] : null;
  }
  if (segments.length === 1 && !RESERVED_SEGMENTS.has(segments[0].toLowerCase())) {
    const ref = segments[0];
    return NUMERIC_ID.test(ref) || VANITY.test(ref) ? ref : null;
  }
  return null;
}

export interface FacebookPostLinkInput {
  permalink: string | null | undefined;
  remotePostId: string | null | undefined;
  /** The Page's public id or username; null when unknown. */
  publicPageRef: string | null | undefined;
}

/**
 * The link to send. Pure: the caller resolves `publicPageRef`.
 *
 * - dry run → null (nothing was posted, so there is nothing to open)
 * - public ref known + story id known → `/{ref}/posts/{story}`, unless Graph's
 *   permalink already leads with that ref (then it is Facebook's own canonical,
 *   slug and all, and is kept verbatim)
 * - otherwise → Graph's permalink, absolutized, or null
 */
export function facebookPostUrl({
  permalink,
  remotePostId,
  publicPageRef,
}: FacebookPostLinkInput): string | null {
  if (isDryRunPost(remotePostId)) return null;
  const normalized = normalizeFacebookPermalink(permalink);
  const ref = parseFacebookPageRef(publicPageRef);
  const story = facebookStoryId(normalized, remotePostId);
  if (!ref || !story) return normalized;

  if (normalized) {
    try {
      const path = new URL(normalized).pathname;
      if (path.startsWith(`/${ref}/posts/`)) return normalized;
    } catch {
      // fall through to the rebuilt URL
    }
  }
  return `${FACEBOOK_ORIGIN}/${ref}/posts/${story}`;
}

// --- resolving the public id ------------------------------------------------

const RESOLVED_TTL_MS = 6 * 60 * 60 * 1000;
const UNRESOLVED_TTL_MS = 10 * 60 * 1000;
let cachedRef: { value: string | null; at: number } | null = null;

/** Test hook — the cache is per instance, like lib/rate-limit.ts. */
export function resetFacebookPageRefCache(): void {
  cachedRef = null;
}

/**
 * The Page's public id or username.
 *
 * `network: false` (every render) reads only the env var and whatever a cron
 * on this instance already learned. `network: true` (publish + notify crons)
 * may ask Graph for the Page's `link` once per TTL.
 *
 * A `link` that only repeats FACEBOOK_PAGE_ID is refused: that is the id
 * public post URLs were already measured NOT to deep-link with (2026-08-23,
 * listing #26), and swapping one doubtful link for another is not a fix.
 */
export async function resolveFacebookPublicPageRef(
  options: { network?: boolean } = {}
): Promise<string | null> {
  const fromEnv = parseFacebookPageRef(socialConfig.facebookPagePublicId);
  if (fromEnv) return fromEnv;

  const now = Date.now();
  if (cachedRef) {
    const ttl = cachedRef.value ? RESOLVED_TTL_MS : UNRESOLVED_TTL_MS;
    if (now - cachedRef.at < ttl) return cachedRef.value;
  }
  if (!options.network || !isFacebookPageConfigured()) return cachedRef?.value ?? null;

  const pageId = socialConfig.facebookPageId;
  const res = await graphGet<{ link?: string }>(pageId, { fields: 'link' });
  let value: string | null = null;
  if (res.ok) {
    const ref = parseFacebookPageRef(res.data.link);
    value = ref && ref !== pageId ? ref : null;
    if (!value) {
      console.error(
        '[social] facebook Page link has no public id; set FACEBOOK_PAGE_PUBLIC_ID',
        res.data.link ?? '(no link field)'
      );
    }
  } else {
    console.error('[social] facebook Page link unavailable:', res.error.message);
  }
  cachedRef = { value, at: now };
  return value;
}

/**
 * Read-time repair for stored rows, so links saved before this fix (and links
 * saved by an instance that could not resolve the public id) are corrected
 * wherever they are shown. Non-Facebook rows pass through untouched.
 */
export function withFacebookPostUrl<
  T extends { platform: string; remotePostId: string | null; remotePermalink: string | null },
>(row: T, publicPageRef: string | null): T {
  if (row.platform !== 'facebook_page') return row;
  const url = facebookPostUrl({
    permalink: row.remotePermalink,
    remotePostId: row.remotePostId,
    publicPageRef,
  });
  return url === row.remotePermalink ? row : { ...row, remotePermalink: url };
}
