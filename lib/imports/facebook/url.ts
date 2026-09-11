/**
 * Parsing — and, more importantly, VETTING — a pasted Facebook post URL.
 *
 * THIS IS AN SSRF GUARD BEFORE IT IS A PARSER. An operator pastes a string and
 * the SERVER dereferences it, which is the whole shape of a server-side request
 * forgery: paste `http://169.254.169.254/latest/meta-data/`, or an internal
 * hostname, and our own credentialed network position does the fetching. So the
 * host is checked against a fixed allowlist and everything else is refused
 * before a socket is opened — not sanitised, not "probably fine", refused.
 *
 * `parseFacebookUrl` returning null is the ONLY thing that makes a URL
 * fetchable, and lib/imports/facebook/fetch.ts re-checks every redirect target
 * through `isAllowedFacebookHost` for the same reason.
 */

/**
 * Hosts we will dereference. Exact matches only — no suffix test, because
 * `facebook.com.evil.com` ends with nothing useful and `endsWith('facebook.com')`
 * would happily accept it.
 */
const ALLOWED_HOSTS = new Set([
  'facebook.com',
  'www.facebook.com',
  'm.facebook.com',
  'mbasic.facebook.com',
  'web.facebook.com',
  'fb.com',
  'www.fb.com',
  'fb.watch',
]);

/**
 * Hosts we will dereference for an IMAGE an operator pasted.
 *
 * Separate from ALLOWED_HOSTS because the shapes differ: post URLs live on a
 * handful of fixed hostnames, while Facebook's photo CDN spreads across
 * per-datacentre names — `scontent-lhr8-1.xx.fbcdn.net`, `scontent.fcmb1-2.fna.fbcdn.net`
 * — that cannot be enumerated.
 *
 * So this one is a SUFFIX test, and the leading dot is the entire safety of it.
 * `endsWith('fbcdn.net')` would accept `evil-fbcdn.net`; `endsWith('.fbcdn.net')`
 * cannot, because the dot has to be a real label boundary. The exact apex is
 * allowed separately rather than by loosening the suffix.
 *
 * Why an allowlist at all: `fetchOriginal` in lib/images/store.ts is a bare
 * `fetch(url)` with no vetting. That is safe only while every URL reaching it
 * came from an already-allowlisted document. An operator typing a URL into a
 * box is exactly the SSRF shape parseFacebookUrl exists to refuse, and the
 * operator being staff does not change what a stolen ops session can do.
 */
export function isAllowedImageHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === 'fbcdn.net' || h.endsWith('.fbcdn.net');
}

export type FacebookUrlKind = 'group_post' | 'page_post' | 'photo' | 'unknown';

export interface ParsedFacebookUrl {
  /** Scheme+host+path, query stripped except the ids we need. Safe to fetch. */
  canonicalUrl: string;
  kind: FacebookUrlKind;
  groupId?: string;
  /** Page slug or numeric id, as it appeared in the path. */
  pageId?: string;
  postId?: string;
}

/** Is this host one we are willing to make a server-side request to? */
export function isAllowedFacebookHost(host: string): boolean {
  return ALLOWED_HOSTS.has(host.toLowerCase());
}

/**
 * Vet and classify a pasted URL. Returns null for anything we will not fetch:
 * a non-http(s) scheme, a host outside the allowlist, credentials in the
 * authority, or an unparseable string.
 */
export function parseFacebookUrl(input: string): ParsedFacebookUrl | null {
  const raw = input?.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  // file:, data:, gopher: and friends never reach the network layer.
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  // `https://facebook.com@evil.com/` parses with host evil.com in a correct
  // parser and facebook.com in a sloppy one. Refuse the ambiguity outright.
  if (url.username || url.password) return null;
  if (!isAllowedFacebookHost(url.hostname)) return null;

  const segments = url.pathname.split('/').filter(Boolean);

  // /groups/<groupId>/posts/<postId>  ·  /groups/<groupId>/permalink/<postId>
  if (segments[0] === 'groups' && segments[1]) {
    const postId =
      segments[2] === 'posts' || segments[2] === 'permalink'
        ? segments[3]
        : undefined;
    return {
      canonicalUrl: `https://www.facebook.com${url.pathname}`,
      kind: 'group_post',
      groupId: segments[1],
      ...(postId ? { postId } : {}),
    };
  }

  // /photo.php?fbid=… and /photo/?fbid=… — a single image with its caption.
  if (segments[0] === 'photo' || segments[0] === 'photo.php') {
    const fbid = url.searchParams.get('fbid') ?? undefined;
    return {
      canonicalUrl: fbid
        ? `https://www.facebook.com/photo/?fbid=${encodeURIComponent(fbid)}`
        : `https://www.facebook.com${url.pathname}`,
      kind: 'photo',
      ...(fbid ? { postId: fbid } : {}),
    };
  }

  // /permalink.php?story_fbid=<postId>&id=<pageId>
  if (segments[0] === 'permalink.php') {
    const postId = url.searchParams.get('story_fbid') ?? undefined;
    const pageId = url.searchParams.get('id') ?? undefined;
    return {
      canonicalUrl: `https://www.facebook.com${url.pathname}${url.search}`,
      kind: 'page_post',
      ...(pageId ? { pageId } : {}),
      ...(postId ? { postId } : {}),
    };
  }

  // /<page>/posts/<postId>  ·  /<page>/videos/<id>
  if (segments.length >= 3 && (segments[1] === 'posts' || segments[1] === 'videos')) {
    return {
      canonicalUrl: `https://www.facebook.com${url.pathname}`,
      kind: 'page_post',
      pageId: segments[0],
      postId: segments[2],
    };
  }

  // /share/p/<id>/ and fb.watch shortlinks — real, but opaque until fetched.
  return {
    canonicalUrl: `https://${url.hostname}${url.pathname}`,
    kind: 'unknown',
  };
}

/**
 * The Graph API wants `<pageId>_<postId>`. Only meaningful for a page post
 * whose page is one we hold a token for.
 */
export function graphPostId(parsed: ParsedFacebookUrl): string | null {
  if (parsed.kind !== 'page_post' || !parsed.pageId || !parsed.postId) return null;
  if (!/^\d+$/.test(parsed.postId)) return null;
  return `${parsed.pageId}_${parsed.postId}`;
}

/**
 * The first Facebook post URL inside a blob of text, or null.
 *
 * Sharing a post from the Facebook app does not put a bare URL on the
 * clipboard — it puts the post's opening line, a newline and then the link, and
 * on a phone that whole thing lands in whichever box the operator tapped
 * first. Splitting it by hand on a touch keyboard is the slowest step in the
 * import, so the URL is lifted out of the paste instead.
 *
 * CANNOT WIDEN WHAT WE WILL FETCH. Every candidate is put through
 * `parseFacebookUrl`, so this only ever finds URLs that were already allowed;
 * a paste containing `http://169.254.169.254/` yields null exactly as if it
 * had been typed into the URL box. The raw match is returned rather than the
 * canonical form so the caller re-vets it — the allowlist is the gate either
 * way, and there is no path where this function's output is trusted on its own.
 */
export function firstFacebookUrlIn(text: string | null | undefined): string | null {
  if (!text) return null;

  // Stops at whitespace and at the bracket/quote characters that wrap a link in
  // prose. Trailing sentence punctuation is trimmed after the fact, because a
  // URL may legitimately end in one of those characters mid-string.
  const matches = text.match(/https?:\/\/[^\s<>"'`)\]}]+/gi);
  if (!matches) return null;

  for (const match of matches) {
    const cleaned = match.replace(/[.,;:!?]+$/, '');
    if (parseFacebookUrl(cleaned)) return cleaned;
  }
  return null;
}
