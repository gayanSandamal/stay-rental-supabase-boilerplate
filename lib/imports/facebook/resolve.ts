/**
 * One call that turns a pasted URL into whatever content we can honestly get.
 *
 * The contract that matters: `resolvePost` NEVER throws and never treats a
 * refusal as a failure. Facebook declining to serve a group post is the normal
 * case, so it comes back as `resolvedVia: 'manual'` with an operator-facing
 * reason, and the review screen asks for a paste. Making that path an error
 * would mean the feature reports itself broken during ordinary use.
 */

import { dropDuplicateLeadLine } from '../advert-text';
import { fetchOpenGraph, fetchOwnPagePost } from './fetch';
import { graphPostId, parseFacebookUrl, type ParsedFacebookUrl } from './url';

export type ResolvedVia = 'graph' | 'og' | 'manual';

export interface ResolvedPost {
  canonicalUrl: string;
  platform: 'facebook_group' | 'facebook_page';
  resolvedVia: ResolvedVia;
  /** Post text, as complete as the source allowed. Empty when nothing came back. */
  text: string;
  /** Remote image URLs, not yet in our bucket. */
  imageUrls: string[];
  authorName: string | null;
  /**
   * Operator-facing explanation when `resolvedVia` is 'manual' or the text is
   * partial. Written for someone deciding what to do next, not for a log.
   */
  note: string | null;
}

/** Rejected before any network call — the host allowlist said no. */
export class UnsupportedUrlError extends Error {
  constructor() {
    super('That does not look like a Facebook post URL.');
    this.name = 'UnsupportedUrlError';
  }
}

export async function resolvePost(input: string): Promise<ResolvedPost> {
  const parsed = parseFacebookUrl(input);
  if (!parsed) throw new UnsupportedUrlError();

  const platform = parsed.kind === 'group_post' ? 'facebook_group' : 'facebook_page';

  const graph = await tryGraph(parsed);
  if (graph) return { ...graph, canonicalUrl: parsed.canonicalUrl, platform };

  const og = await fetchOpenGraph(parsed.canonicalUrl).catch(() => null);
  if (og) {
    // og:description is a TRUNCATED preview. Saying so is the difference
    // between an operator checking the rent against the original and one
    // trusting a number that was cut off mid-sentence.
    return {
      canonicalUrl: parsed.canonicalUrl,
      platform,
      resolvedVia: 'og',
      // og:description opens with the post's own first line, which is also what
      // Facebook put in og:title — so joining them says the headline twice. See
      // dropDuplicateLeadLine: the duplicate is ours, not the advert's.
      text: dropDuplicateLeadLine([og.title, og.description].filter(Boolean).join('\n\n')),
      imageUrls: og.imageUrls,
      authorName: null,
      note:
        'Facebook only served its public preview — usually the first line of ' +
        'the post and the cover photo, and nothing else. The rest of the ad, ' +
        'including the phone number, is not in what it sends us. Open the ' +
        'original, paste the full text below and add the other photos.',
    };
  }

  return {
    canonicalUrl: parsed.canonicalUrl,
    platform,
    resolvedVia: 'manual',
    text: '',
    imageUrls: [],
    authorName: null,
    note:
      parsed.kind === 'group_post'
        ? 'Facebook does not allow group posts to be read automatically — it ' +
          'removed that API in April 2024. Open the post, copy its text into ' +
          'the box below, and upload the photos.'
        : 'Facebook served a login wall for this post instead of its content. ' +
          'Open the post, copy its text into the box below, and upload the photos.',
  };
}

/** Only ever succeeds for our own Page. */
async function tryGraph(
  parsed: ParsedFacebookUrl
): Promise<Omit<ResolvedPost, 'canonicalUrl' | 'platform'> | null> {
  const graphId = graphPostId(parsed);
  if (!graphId) return null;

  const post = await fetchOwnPagePost(graphId).catch(() => null);
  if (!post?.message && !post?.imageUrls.length) return null;

  return {
    resolvedVia: 'graph',
    text: post.message ?? '',
    imageUrls: post.imageUrls,
    authorName: post.authorName,
    note: null,
  };
}
