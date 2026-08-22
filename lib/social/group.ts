/**
 * One card per listing, not one per (listing, platform).
 *
 * Back Office → Social rendered a card for every row, so listing #22 occupied
 * four near-identical blocks and #21 another four. Nothing showed what happened
 * to a listing as a whole, and the captions — usually byte-identical across
 * platforms — were printed four times over.
 *
 * Pure and DB-free so the shape can be tested directly: the same rows, grouped.
 */

import type { listingSocialPosts } from '@/lib/db/schema';
import { isDryRunPost } from './types';

type SocialPost = typeof listingSocialPosts.$inferSelect;

export interface SocialRow {
  post: SocialPost;
  listingTitle: string | null;
  listingStatus: string | null;
}

export interface ListingGroup {
  listingId: number;
  title: string | null;
  listingStatus: string | null;
  posts: SocialPost[];
  /** Distinct captions, each labelled with the platforms that share it. */
  captions: Array<{ caption: string; platforms: string[] }>;
  /** e.g. "2 posted · 1 dry run · 1 draft" */
  summary: string;
  failed: number;
  /** Real posts that could still be pulled down — dry runs cannot. */
  live: number;
}

export function groupByListing(rows: SocialRow[]): ListingGroup[] {
  const byListing = new Map<number, SocialRow[]>();
  for (const row of rows) {
    const list = byListing.get(row.post.listingId) ?? [];
    list.push(row);
    byListing.set(row.post.listingId, list);
  }

  const groups: ListingGroup[] = [];
  for (const [listingId, items] of byListing) {
    const posts = items.map((i) => i.post);
    const dryRuns = posts.filter((p) => isDryRunPost(p.remotePostId)).length;
    // `posted` AND not a dry run: a dry-run row reports success without having
    // sent anything, so counting it as live would offer a takedown for nothing.
    const live = posts.filter((p) => p.status === 'posted' && !isDryRunPost(p.remotePostId)).length;
    const failed = posts.filter((p) => p.status === 'failed').length;
    const drafts = posts.filter((p) => p.platform === 'facebook_group').length;
    const pending = posts.filter((p) => p.status === 'queued' || p.status === 'running').length;
    const pulled = posts.filter((p) => p.status === 'pulled').length;

    const parts: string[] = [];
    if (live) parts.push(`${live} posted`);
    if (dryRuns) parts.push(`${dryRuns} dry run`);
    if (failed) parts.push(`${failed} failed`);
    if (drafts) parts.push(`${drafts} draft`);
    if (pending) parts.push(`${pending} pending`);
    if (pulled) parts.push(`${pulled} pulled`);

    // Dedupe captions by text. Identical across platforms is the common case,
    // and printing the same 300 characters four times is the noise being fixed;
    // they are NOT always equal though (Instagram says "link in bio", TikTok
    // caps the title), so distinct ones are kept and labelled.
    const captionMap = new Map<string, string[]>();
    for (const p of posts) {
      if (!p.caption) continue;
      const platforms = captionMap.get(p.caption) ?? [];
      platforms.push(p.platform);
      captionMap.set(p.caption, platforms);
    }

    groups.push({
      listingId,
      title: items[0].listingTitle,
      listingStatus: items[0].listingStatus,
      posts,
      captions: [...captionMap].map(([caption, platforms]) => ({ caption, platforms })),
      summary: parts.join(' · '),
      failed,
      live,
    });
  }

  // Newest activity first, by the most recent row in each group.
  return groups.sort(
    (a, b) =>
      Math.max(...b.posts.map((p) => p.createdAt.getTime())) -
      Math.max(...a.posts.map((p) => p.createdAt.getTime()))
  );
}
