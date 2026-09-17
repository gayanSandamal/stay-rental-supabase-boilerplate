import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { firstFacebookUrlIn, parseFacebookUrl } from '@/lib/imports/facebook/url';
import { CONSENT_TEMPLATE_TEXT } from '@/lib/imports/message';
import { originLabel } from '@/lib/imports/origin-label';

/**
 * PASTING AN ADVERT THAT HAS NO FACEBOOK POST BEHIND IT.
 *
 * Reported 2026-09-17: an operator pasted a whole advert, the button read
 * "Create draft", and nothing happened — `ready` was `urlOk && !pending`, so
 * the Facebook URL was doing all the gating. The first fix made the screen say
 * so. This is the second: the URL is now genuinely optional, because an advert
 * a landlord sends to the office directly has no post to link to.
 *
 * Migration 0065 makes `post_imports.source_url` nullable. The column is NOT
 * given a placeholder — `Original post` has to lead somewhere or not be
 * offered.
 *
 * WHAT DID NOT CHANGE, and is the point of the last block below: consent.
 * `assertImportConsent` is still the one gate on publishing. All that narrows
 * is which channel can obtain it for a sourceless advert.
 */
function code(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const FORM = 'app/(dashboard)/back-office/imports/new/import-url-form.tsx';
const ACTIONS = 'app/(dashboard)/back-office/imports/actions.ts';

/** The advert from the report, trimmed to the lines that decide the outcome. */
const PASTED_ADVERT = [
  'https://maps.app.goo.gl/S5eXsDceHJwgzfB47?g_st=awb',
  '3-Bedroom only 17 unit Apartment',
  'Colombo6',
  'Wellawatte North',
  '1091.78 sqft',
  '0777008462',
].join('\n');

describe('an advert with no Facebook post in it', () => {
  /*
   * The advert opens with a link, which is what made the original report
   * confusing: the operator could see a URL in the box they pasted into. It is
   * a Google Maps pin, and the lifter only ever wanted a Facebook post.
   */
  it('does not lift a non-Facebook link out of the paste', () => {
    expect(firstFacebookUrlIn(PASTED_ADVERT)).toBeNull();
  });

  it('still recognises a real post link when one is there', () => {
    const withPost = `${PASTED_ADVERT}\nhttps://www.facebook.com/groups/1234567890/posts/9876543210`;
    expect(parseFacebookUrl(firstFacebookUrlIn(withPost) ?? '')).not.toBeNull();
  });
});

describe('the form accepts either input', () => {
  /*
   * The whole fix in one assertion. `urlOk` alone was the bug; text on its own
   * now satisfies the gate. A typed-but-malformed link still blocks, because
   * that is a mistake to fix rather than an input to do without — silently
   * ignoring it would drop provenance the operator believed they had given.
   */
  it('lets pasted text alone enable the submit', () => {
    const src = code(FORM);
    expect(src).toMatch(/const\s+ready\s*=\s*\(urlOk\s*\|\|\s*\(hasText\s*&&\s*!showUrlError\)\)/);
  });

  it('never lets the browser block a text-only submit', () => {
    expect(code(FORM)).toContain('required={false}');
  });

  it('marks the URL field optional rather than implying it is needed', () => {
    const src = code(FORM);
    expect(src).toMatch(/Facebook post URL[\s\S]{0,120}optional/);
  });

  /*
   * A malformed link is still a stop. Losing this would let a typo become a
   * silently sourceless import.
   */
  it('still blocks on a link that was typed and rejected', () => {
    const src = code(FORM);
    expect(src).toContain('Fix the post link above to continue.');
  });
});

describe('the sourceless import is created honestly', () => {
  it('stores no URL rather than inventing one', () => {
    const src = code(ACTIONS);
    expect(src).toMatch(/canonicalUrl:\s*null/);
    expect(src).toMatch(/platform:\s*'pasted'/);
  });

  /*
   * An empty screen is still refused. Without this the button would create a
   * blank row from nothing.
   */
  it('refuses a submit with neither a link nor any text', () => {
    const src = code(ACTIONS);
    expect(src).toMatch(/if\s*\(!url\s*&&\s*!pastedText\)/);
  });

  it('labels the origin without claiming a platform it does not have', () => {
    expect(
      originLabel({ platform: 'pasted', resolvedVia: 'manual', sourceUrl: null, importId: 1 })
    ).toBe('Imported · pasted advert');
  });
});

describe('consent is narrowed, not relaxed', () => {
  /*
   * THE REASON THE WHATSAPP ASK IS BLOCKED FOR A PASTED IMPORT. The approved
   * template opens by telling the owner where we found their advert. For an
   * advert with no post behind it that sentence is false, and it is registered
   * with Meta so it cannot be varied per import. If this assertion ever fails
   * because the template stopped naming Facebook, the block below can be
   * revisited — until then it must stay.
   */
  it('the consent template still claims the advert was found on Facebook', () => {
    expect(CONSENT_TEMPLATE_TEXT).toContain('on Facebook');
  });

  it('refuses to send that template for an import with no source URL', () => {
    const src = code(ACTIONS);
    expect(src).toMatch(/if\s*\(!saved\.sourceUrl\)/);
    expect(src).toContain('pasted_needs_manual_consent');
  });

  /*
   * And the gate itself is untouched: publishing still turns on
   * consentGrantedAt alone, via the same assert every path calls.
   */
  it('leaves assertImportConsent as the single publish gate', () => {
    const publish = code('lib/imports/publish.ts');
    expect(publish).toContain('assertImportConsent');
  });
});
