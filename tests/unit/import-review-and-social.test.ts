import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function code(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('re-read fills empty fields instead of overwriting', () => {
  const actions = code('app/(dashboard)/back-office/imports/actions.ts');

  /*
   * Checked at the source rather than by calling it: actions.ts is a 'use
   * server' module, where every export must be an async server action, so the
   * helper cannot be exported for a direct test.
   */
  it('merges the fresh parse onto what is already set', () => {
    // It used to replace parsedPayload wholesale, discarding every correction
    // the operator had made while the button claimed the opposite. That matters
    // more now: pasting and re-reading is the MAIN path, not a repair.
    expect(actions).toContain('fillEmpty(');
    expect(actions).toContain('JSON.stringify(merged)');
  });
});

describe('share-on-social', () => {
  const publish = code('lib/imports/publish.ts');

  it('records consent as whatsapp or ops, driven by how it was actually obtained', () => {
    /*
     * This assertion INVERTED at migration 0060, and the inversion is the point.
     *
     * It used to require `ops` unconditionally, which was the honest label
     * while the importer published first and told the owner afterwards: an
     * operator had ticked a box about a stranger's property and nobody had
     * asked its owner anything. The importer is now opt-in — the consent
     * template names Facebook, Instagram and TikTok, and `assertImportConsent`
     * proves a yes arrived before any listing row exists — so `whatsapp` is
     * what actually happened for a real template reply.
     *
     * 0061 reopened the `ops` branch for a NEW, honest reason: an operator
     * who attested consent themselves (manual, no template) never had that
     * asked-and-answered exchange, so `whatsapp` would be recorded for
     * something the template never asked. `askedByTemplate` is what decides
     * between the two — never a bare literal that always claims one or the
     * other.
     *
     * `web` remains wrong for a third reason: that is a landlord ticking a
     * box in our own UI about their own property.
     */
    expect(publish).toContain("'whatsapp' as const");
    expect(publish).toContain("'ops' as const");
    expect(publish).toMatch(/socialConsentSource:\s*askedByTemplate/);
  });

  it('only records consent when the box was ticked', () => {
    expect(publish).toContain('record.shareOnSocial');
    const consent = publish.indexOf('socialConsentAt: now');
    const guard = publish.lastIndexOf('record.shareOnSocial', consent);
    expect(guard).toBeGreaterThanOrEqual(0);
  });

  it('audits whether the owner was actually asked, not a hardcoded yes', () => {
    // Flipped with the assertion above at 0060: the audit trail has to say
    // whether a human was actually asked. 0061 made even that conditional —
    // `ownerAsked` must track the same `askedByTemplate` decision as
    // `socialConsentSource`, so the two can never disagree about whether the
    // template actually reached the owner.
    expect(publish).toContain("logListingAction('listing_social_consent_granted'");
    expect(publish).toMatch(/ownerAsked:\s*askedByTemplate/);
  });

  it('audits regardless of whether moderation holds the listing', () => {
    // The audit must not be nested inside the !moderationArmed branch — with
    // moderation on in production that would never fire.
    const audit = publish.indexOf("'listing_social_consent_granted'");
    const notifyGuard = publish.indexOf('if (!moderationArmed) {\n      notify');
    expect(audit).toBeGreaterThanOrEqual(0);
    if (notifyGuard >= 0) expect(audit).toBeLessThan(notifyGuard);
  });
});

describe('the moderation sweeper notifies with a FRESH listing row', () => {
  const engine = code('lib/moderation/engine.ts');

  it('re-reads before notifying', () => {
    /*
     * `listing` is persist()'s parameter — the row as claimed, still `pending`.
     * Handing that to the notifier makes every downstream status check see
     * pending, so both social paths bail on status !== 'active': a landlord who
     * ticked "share on social" was never enqueued, and nobody was even asked.
     */
    expect(engine).toContain('notifyModerationOutcome(fresh, verdict, result)');
    const reread = engine.indexOf('const fresh =');
    const notify = engine.indexOf('notifyModerationOutcome(fresh');
    expect(reread).toBeGreaterThanOrEqual(0);
    expect(notify).toBeGreaterThan(reread);
  });

  it('falls back to the stale row rather than sending nothing', () => {
    expect(engine).toContain('?? listing');
  });
});

describe('origin lookups are batched', () => {
  it('never queries per row', () => {
    const origin = code('lib/imports/origin.ts');
    expect(origin).toContain('inArray(postImports.listingId, listingIds)');
    expect(origin).not.toContain('Promise.all');
  });

  it('every screen that renders the badge fetched origins in one call', () => {
    for (const file of [
      'app/(dashboard)/back-office/moderation/page.tsx',
      'app/(dashboard)/back-office/listings/page.tsx',
    ]) {
      expect(code(file), file).toContain('importOriginsFor(rows.map((r) => r.id))');
    }
  });
});

describe('migration 0059', () => {
  const sql = readFileSync(
    join(process.cwd(), 'lib/db/migrations/0059_import_social_and_listing_index.sql'),
    'utf-8'
  );

  it('adds the column and the missing index', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS share_on_social boolean/i);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS post_imports_listing_idx/i);
  });

  it('is registered, or it would never run', () => {
    const runner = readFileSync(join(process.cwd(), 'lib/db/run-all-migrations.ts'), 'utf-8');
    expect(runner).toContain("'0059_import_social_and_listing_index.sql'");
  });

  it('contains no DO block, which the splitter mis-parses', () => {
    expect(sql).not.toMatch(/DO \$\$/);
  });
});
