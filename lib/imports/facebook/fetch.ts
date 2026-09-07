/**
 * Getting the content of a Facebook post, with no illusions about how often
 * that will work.
 *
 * WHAT ACTUALLY WORKS, IN ORDER:
 *
 *  1. Graph API, for OUR OWN Page only. Full message text and every attachment.
 *     Reliable, and irrelevant to the main use case.
 *  2. OpenGraph meta tags on the public HTML. Facebook serves these to crawlers
 *     for some public content. `og:description` is TRUNCATED — it is a preview,
 *     not the post — so what comes back is a starting point for the operator,
 *     never a finished extraction.
 *  3. Nothing. Group posts and most third-party page posts return a login wall.
 *     Meta removed the Groups API on 2024-04-22 and gated third-party page
 *     reads behind App Review + Business Verification, so there is no supported
 *     path and no clever header that opens one.
 *
 * Case 3 is a NORMAL OUTCOME, not an error: the caller routes it to the same
 * review screen with a note asking the operator to paste. Anything else would
 * make the common case look like a bug.
 *
 * NO HTML PARSER. Four meta tags do not justify a dependency this repo has
 * never had; a scoped regex over a capped prefix of the document is enough and
 * matches how the rest of the codebase reads provider payloads.
 */

import { GRAPH_API_BASE, socialConfig } from '@/lib/social/config';
import { isAllowedFacebookHost } from './url';

/** Enough for <head>; a post page is megabytes of script we have no use for. */
const MAX_HTML_BYTES = 512 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
/** Redirect chains are short and legitimate ones stay on Facebook. */
const MAX_REDIRECTS = 3;

export interface OpenGraphPost {
  title: string | null;
  description: string | null;
  imageUrls: string[];
}

export interface GraphPost {
  message: string | null;
  imageUrls: string[];
  authorName: string | null;
}

/**
 * Follow redirects BY HAND, re-vetting every hop.
 *
 * `redirect: 'follow'` would let a facebook.com URL redirect us to an internal
 * address, which is the exact SSRF the allowlist exists to prevent — the guard
 * has to apply to where we END UP, not only to what was pasted.
 */
async function fetchAllowlisted(url: string): Promise<Response | null> {
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let target: URL;
    try {
      target = new URL(current);
    } catch {
      return null;
    }
    if (target.protocol !== 'https:' && target.protocol !== 'http:') return null;
    if (!isAllowedFacebookHost(target.hostname)) return null;

    let res: Response;
    try {
      res = await fetch(target.toString(), {
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          // Facebook serves OG tags to crawlers and a login wall to everyone
          // else. This is the same identification its own scraper sends; we are
          // asking for the public preview, not pretending to be a signed-in user.
          'user-agent': 'facebookexternalhit/1.1 (+https://easyrent.lk)',
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'en',
        },
      });
    } catch {
      return null;
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return null;
      current = new URL(location, target).toString();
      continue;
    }
    return res;
  }
  return null;
}

/** Read at most MAX_HTML_BYTES, so a huge response cannot exhaust memory. */
async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return (await res.text()).slice(0, MAX_HTML_BYTES);

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  await reader.cancel().catch(() => {});
  return new TextDecoder().decode(
    chunks.reduce<Uint8Array>((acc, chunk) => {
      const next = new Uint8Array(acc.length + chunk.length);
      next.set(acc);
      next.set(chunk, acc.length);
      return next;
    }, new Uint8Array())
  );
}

/**
 * Pull one `<meta property="og:x" content="y">` value. Handles both attribute
 * orders and either quote style, because Facebook's markup uses both.
 */
function metaContent(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']`,
      'i'
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["']`,
      'i'
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeEntities(match[1]).trim() || null;
  }
  return null;
}

/** The handful of entities that actually appear in an og: attribute. */
function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(x?)([0-9a-f]+);/gi, (_m, hex: string, code: string) => {
      const point = parseInt(code, hex ? 16 : 10);
      return Number.isFinite(point) && point > 0 ? String.fromCodePoint(point) : '';
    })
    .replace(/&amp;/g, '&');
}

/**
 * Best-effort public preview. Returns null when Facebook served a login wall
 * (no og:title at all) — an expected outcome, logged but never thrown.
 */
export async function fetchOpenGraph(url: string): Promise<OpenGraphPost | null> {
  const res = await fetchAllowlisted(url);
  if (!res || !res.ok) return null;

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('html')) return null;

  const html = await readCapped(res).catch(() => '');
  if (!html) return null;

  const title = metaContent(html, 'og:title');
  const description = metaContent(html, 'og:description');
  const image = metaContent(html, 'og:image');

  // A login wall still renders a generic og:title ("Facebook"), so a title on
  // its own proves nothing. Real content has a description or an image.
  if (!description && !image) return null;

  return {
    title,
    description,
    imageUrls: image ? [image] : [],
  };
}

/**
 * The complete post — text and every attached photo — for a Page we hold a
 * token for. Returns null for anyone else's page, which is every page that
 * matters here; kept because when it does apply it is strictly better than OG.
 */
export async function fetchOwnPagePost(graphId: string): Promise<GraphPost | null> {
  const token = socialConfig.facebookPageAccessToken;
  if (!token) return null;

  try {
    const res = await fetch(
      `${GRAPH_API_BASE}/${encodeURIComponent(graphId)}` +
        `?fields=message,from{name},attachments{media,subattachments}` +
        `&access_token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
    );
    if (!res.ok) {
      console.log('[imports] graph post fetch failed', res.status, await res.text());
      return null;
    }
    const body = (await res.json()) as GraphPostResponse;

    const imageUrls: string[] = [];
    for (const attachment of body.attachments?.data ?? []) {
      if (attachment.media?.image?.src) imageUrls.push(attachment.media.image.src);
      for (const sub of attachment.subattachments?.data ?? []) {
        if (sub.media?.image?.src) imageUrls.push(sub.media.image.src);
      }
    }

    return {
      message: body.message ?? null,
      imageUrls: [...new Set(imageUrls)],
      authorName: body.from?.name ?? null,
    };
  } catch (err) {
    console.log('[imports] graph post fetch error', err);
    return null;
  }
}

interface GraphMedia {
  media?: { image?: { src?: string } };
}
interface GraphPostResponse {
  message?: string;
  from?: { name?: string };
  attachments?: {
    data?: Array<GraphMedia & { subattachments?: { data?: GraphMedia[] } }>;
  };
}
