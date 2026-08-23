import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

/**
 * Every way a listing leaves `active` must take its social posts down with it.
 *
 * THE INCIDENT (2026-08-23). Listings #24 and #25 were archived by the landlord
 * through their own delete link and their Facebook posts stayed up. The rule was
 * already written down in CLAUDE.md, `pullDownForListing` already existed, and
 * five of the six de-listing paths already called it — the access-link delete
 * page, which is the one the WhatsApp "🗑️ To remove it:" link opens and so the
 * commonest path of all, was the one that had never been wired.
 *
 * That is not a bug that a test of `pullDownForListing` itself would catch: the
 * function was fine. What was missing was a CALLER. So this asserts the
 * property that actually broke — every file that de-lists also pulls down —
 * because the next de-listing path someone adds will forget in exactly the same
 * way, and `reconcileOrphanedSocialPosts` should be the safety net rather than
 * the only thing standing between a deleted landlord and a live advert.
 */

/** Files that set a listing to a non-active status directly in the database. */
const DE_LISTING_SOURCES = [
  'app/(dashboard)/dashboard/listings/[id]/delete/actions.ts',
  'lib/db/check-expired-listings.ts',
  'lib/intake/session.ts',
  'app/api/listings/[id]/route.ts',
  'app/api/cron/purge-archived/route.ts',
];

/**
 * `session.ts` archives inside the WhatsApp DELETE flow but returns the outcome
 * for the webhook to act on, which is where the pull-down lives — the archive
 * happens in a transaction and a Graph call has no business inside one.
 */
const PULLS_DOWN_ELSEWHERE: Record<string, string> = {
  'lib/intake/session.ts': 'app/api/whatsapp/webhook/route.ts',
};

async function source(path: string): Promise<string> {
  return readFile(path, 'utf8');
}

describe('every de-listing path takes the social posts down', () => {
  it.each(DE_LISTING_SOURCES)('%s pulls down', async (path) => {
    const owner = PULLS_DOWN_ELSEWHERE[path] ?? path;
    expect(await source(owner)).toContain('pullDownForListing');
  });

  it('THE REGRESSION: the landlord delete page pulls down', async () => {
    // The exact file that was missing the call. Named separately from the
    // table above so a careless edit to that list cannot silently drop it.
    const text = await source('app/(dashboard)/dashboard/listings/[id]/delete/actions.ts');
    expect(text).toContain('pullDownForListing');
    // And it must happen before the redirect — redirect() throws, so anything
    // after it never runs.
    expect(text.indexOf('pullDownForListing')).toBeLessThan(
      text.lastIndexOf("redirect('/dashboard/listings?removed=1')")
    );
  });

  it('the reconciler exists and is wired into the sweeper', async () => {
    // The backstop for whatever path is added next.
    expect(await source('lib/social/publish.ts')).toContain(
      'export async function reconcileOrphanedSocialPosts'
    );
    expect(await source('app/api/cron/publish-social/route.ts')).toContain(
      'reconcileOrphanedSocialPosts'
    );
  });

  it('the reconciler only ever targets posts of non-active listings', async () => {
    // A predicate that drifted to, say, `status = 'archived'` would silently
    // stop covering expired and rented listings — both of which are off the
    // site and must not stay advertised.
    const text = await source('lib/social/publish.ts');
    const fn = text.slice(text.indexOf('export async function reconcileOrphanedSocialPosts'));
    expect(fn).toMatch(/<>\s*'active'/);
    expect(fn).toMatch(/listingSocialPosts\.status,\s*'posted'/);
  });
});
