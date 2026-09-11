import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

/**
 * Reactivating a listing (un-archived, marked available again after `rented`,
 * reapproved) must be able to reshare it on social.
 *
 * THE BUG: `enqueueSocialPosts` used `onConflictDoNothing()`. The unique
 * (listing_id, platform) index means a listing that was ever pulled down
 * already has rows for every platform — `pulled`/`skipped`/`failed` — so the
 * insert always conflicted and the "no-op" landed on every reactivation, not
 * just the intended double-consent case. `promptForSocialConsent` /
 * `enqueueIfAlreadyConsented` still ran, appeared to succeed, and nothing was
 * ever queued. Ops' own "Retry" buttons can't reach a `pulled` row either
 * (deliberately, per the comment in social/actions.ts) — this insert is the
 * only path back to `queued` for those rows.
 */

async function publishSource(): Promise<string> {
  return readFile('lib/social/publish.ts', 'utf8');
}

function enqueueSocialPostsBody(text: string): string {
  const start = text.indexOf('export async function enqueueSocialPosts');
  const nextExport = text.indexOf('\nexport ', start + 1);
  return text.slice(start, nextExport === -1 ? undefined : nextExport);
}

describe('enqueueSocialPosts revives a listing that went active again', () => {
  it('upserts instead of silently dropping the conflict', async () => {
    const fn = enqueueSocialPostsBody(await publishSource());
    expect(fn).toContain('onConflictDoUpdate');
    expect(fn).not.toContain('onConflictDoNothing');
  });

  it('only revives terminal rows — never a post already queued, running or posted', async () => {
    const fn = enqueueSocialPostsBody(await publishSource());
    expect(fn).toMatch(/inArray\(\s*listingSocialPosts\.status,\s*\[\s*'pulled',\s*'skipped',\s*'failed'\s*\]\s*\)/);
  });

  it('refuses to revive a row whose old post still needs a human to remove it', async () => {
    // Instagram and TikTok have no delete API — a `pulled` row with
    // needsManualTakedown still true means the OLD post is still live.
    // Requeuing it before a human confirms removal would double-post.
    const fn = enqueueSocialPostsBody(await publishSource());
    expect(fn).toMatch(/needsManualTakedown,\s*false/);
  });

  it('resets the row to a clean queued state, not a stale one', async () => {
    const fn = enqueueSocialPostsBody(await publishSource());
    expect(fn).toMatch(/status:\s*'queued'/);
    expect(fn).toMatch(/attempts:\s*0/);
    expect(fn).toMatch(/leaseUntil:\s*null/);
  });
});
