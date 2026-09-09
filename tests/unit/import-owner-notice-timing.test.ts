import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The owner notice must not go out before the listing is public.
 *
 * The template says the property "is now listed" and links to it. Sent while
 * moderation still has the listing `pending`, it describes something the owner
 * cannot see — and if the checks then HOLD it, something that never appears at
 * all. With `enableListingModeration` on (its state in production) that was
 * every single import.
 *
 * These read source rather than run the pipeline because the rule is about
 * WHERE the call sits relative to the moderation branch, which is exactly what
 * a mocked unit test would paper over.
 */
function code(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('publish-time notification', () => {
  const publish = code('lib/imports/publish.ts');

  it('only notifies the owner when the listing is not held by moderation', () => {
    const guard = publish.indexOf('if (!moderationArmed) {');
    const call = publish.indexOf('notify = await notifyOwner(');
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(call).toBeGreaterThan(guard);
  });

  it('has exactly one owner-notify call site, so the guard cannot be bypassed', () => {
    expect(publish.match(/await notifyOwner\(/g) ?? []).toHaveLength(1);
  });

  it('reports a deferred notice as deferred, never as sent or dry_run', () => {
    // A row reading `dry_run` for a message the sweeper is about to send is the
    // same lie as one reading `sent` for a message never sent.
    expect(publish).toContain("moderationArmed ? 'deferred' : 'dry_run'");
  });

  it('still stamps notifiedAt when it does send, so nobody is told twice', () => {
    expect(publish).toContain('notifiedAt: new Date()');
  });
});

describe('sweeper-time notification', () => {
  const sweeper = code('lib/moderation/notify.ts');

  it('sends the imported owner their notice on first publish', () => {
    expect(sweeper).toContain('notifyImportedOwnerForListing');
    const firstPublishGuard = sweeper.indexOf('isFirstPublish');
    const importCall = sweeper.indexOf('notifyImportedOwnerForListing');
    expect(firstPublishGuard).toBeGreaterThanOrEqual(0);
    expect(importCall).toBeGreaterThan(firstPublishGuard);
  });

  it('routes imported owners to the template, never to free-form text', () => {
    // They have never messaged us, so there is no 24-hour service window and
    // free-form is rejected with 131047.
    const importBranch = sweeper.slice(
      sweeper.indexOf('notifyImportedOwnerForListing') - 400,
      sweeper.indexOf('notifyImportedOwnerForListing') + 400
    );
    expect(importBranch).not.toContain('sendText');
  });

  it('marks the landlord notified so the reconciler does not chase it', () => {
    expect(sweeper).toContain('markLandlordNotified');
  });
});

describe('the notice resolver', () => {
  const notify = code('lib/imports/notify.ts');

  it('guards on notifiedAt being null, so a re-check cannot re-announce', () => {
    expect(notify).toContain('isNull(postImports.notifiedAt)');
  });

  it('never falls back to free-form text', () => {
    expect(notify).toContain('sendWhatsAppTemplate');
    expect(notify).not.toContain('sendWhatsAppText');
  });
});

/**
 * EVERY path to `active` owes the owner their notice.
 *
 * For a while only the moderation sweeper sent it, so an ops override or a
 * PATCH to /api/listings/[id] published the listing and told nobody — and told
 * nobody PERMANENTLY, because `postImports.notifiedAt` stays null and no job
 * looks at the row again. The reconciler made it worse by stamping
 * `landlordNotifiedAt` on any listing with no intake row, closing the last door.
 *
 * These assert the call SITE on each path rather than mocking a send, because
 * the defect was a missing call, which no amount of mocking the sender catches.
 */
describe('every go-live path notifies the imported owner', () => {
  const paths: ReadonlyArray<readonly [string, string]> = [
    ['the moderation sweeper', 'lib/moderation/notify.ts'],
    ['the ops publish-anyway override', 'app/(dashboard)/back-office/moderation/actions.ts'],
    ['the ops approve endpoint', 'app/api/listings/[id]/route.ts'],
  ];

  for (const [label, file] of paths) {
    it(`${label} calls notifyImportedOwnerForListing`, () => {
      expect(code(file)).toContain('notifyImportedOwnerForListing');
    });
  }

  it('the override sends only on a FIRST publish, not on a re-approval', () => {
    const actions = code('app/(dashboard)/back-office/moderation/actions.ts');
    const call = actions.indexOf('notifyImportedOwnerForListing');
    expect(call).toBeGreaterThanOrEqual(0);
    expect(actions.slice(Math.max(0, call - 300), call)).toContain('if (!listing.publishedAt)');
  });

  it('the endpoint sends only on a transition INTO active', () => {
    const route = code('app/api/listings/[id]/route.ts');
    const call = route.indexOf('notifyImportedOwnerForListing');
    expect(call).toBeGreaterThanOrEqual(0);
    expect(route.slice(Math.max(0, call - 300), call)).toContain(
      "status === 'active' && listing.status !== 'active'"
    );
  });

  it('the reconciler tries the notice BEFORE it writes a listing off', () => {
    const sweeper = code('lib/moderation/notify.ts');
    const reconciler = sweeper.slice(
      sweeper.indexOf('export async function reconcileMissedAnnouncements')
    );
    const call = reconciler.indexOf('notifyImportedOwnerForListing');
    const stamp = reconciler.indexOf('markLandlordNotified');
    expect(call).toBeGreaterThanOrEqual(0);
    // Stamping first is what turned one missed notice into a permanent one.
    expect(call).toBeLessThan(stamp);
  });
});

describe('migration 0058 closes the two public tables', () => {
  const sql = readFileSync(
    join(process.cwd(), 'lib/db/migrations/0058_enable_rls_on_missed_tables.sql'),
    'utf-8'
  );

  it('enables RLS on both tables that were missing it', () => {
    expect(sql).toMatch(/ALTER TABLE public\.impersonation_sessions ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/ALTER TABLE public\.post_imports ENABLE ROW LEVEL SECURITY/i);
  });

  it('also revokes the blanket anon grants', () => {
    expect(sql).toMatch(/REVOKE ALL ON public\.impersonation_sessions FROM anon, authenticated/i);
    expect(sql).toMatch(/REVOKE ALL ON public\.post_imports FROM anon, authenticated/i);
  });

  it('is registered with the runner, or it would never execute', () => {
    const runner = readFileSync(join(process.cwd(), 'lib/db/run-all-migrations.ts'), 'utf-8');
    expect(runner).toContain("'0058_enable_rls_on_missed_tables.sql'");
  });

  it('contains no DO block, which the statement splitter mis-parses', () => {
    expect(sql).not.toMatch(/DO \$\$/);
  });
});
