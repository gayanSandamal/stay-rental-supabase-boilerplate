import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { firstFacebookUrlIn, parseFacebookUrl } from '@/lib/imports/facebook/url';
import { resolveFromPastedText, UnsupportedUrlError } from '@/lib/imports/facebook/resolve';

/**
 * PASTE-FIRST IMPORTING.
 *
 * The import screen used to take a URL and nothing else, then spend several
 * seconds asking Facebook — which removed the groups API in April 2024 and
 * gates third-party page reads behind App Review, so for most adverts it
 * returns nothing. The operator landed on an empty review screen, pasted the
 * text they had all along, and paid for a SECOND round trip to re-read it.
 *
 * These cover the two things that made one submit enough: lifting the link out
 * of a paste, and building a draft from that paste without touching the
 * network. The SSRF guard is the part that must not have moved.
 */
function code(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const GROUP_POST = 'https://www.facebook.com/groups/1234567890/posts/9876543210';

describe('lifting the link out of a paste', () => {
  /*
   * The shape that matters. Sharing a post from the Facebook app does not put a
   * bare URL on the clipboard — it puts the post's opening line, a blank line
   * and then the link. On a phone that whole thing lands in one box.
   */
  it('finds the post URL inside a shared blob of advert text', () => {
    const shared = [
      'House for rent in Nugegoda. 3 bedrooms, Rs. 85,000 per month.',
      'Call 0771234567',
      '',
      GROUP_POST,
    ].join('\n');

    expect(firstFacebookUrlIn(shared)).toBe(GROUP_POST);
  });

  it('returns null when there is no link in the text', () => {
    expect(firstFacebookUrlIn('3BR house, Kandy, 60k, call 0712345678')).toBeNull();
    expect(firstFacebookUrlIn('')).toBeNull();
    expect(firstFacebookUrlIn(null)).toBeNull();
    expect(firstFacebookUrlIn(undefined)).toBeNull();
  });

  /*
   * THE POINT OF THE WHOLE FUNCTION'S SAFETY. Every candidate goes through
   * parseFacebookUrl, so lifting a URL out of text can never make something
   * fetchable that typing it into the box would not have. An operator pastes,
   * and the SERVER dereferences — this is the SSRF surface, not a convenience.
   */
  it('cannot widen the allowlist', () => {
    expect(firstFacebookUrlIn('see http://169.254.169.254/latest/meta-data/')).toBeNull();
    expect(firstFacebookUrlIn('http://127.0.0.1:3000/api/user')).toBeNull();
    expect(firstFacebookUrlIn('https://facebook.com.evil.com/groups/1/posts/2')).toBeNull();
    expect(firstFacebookUrlIn('https://evil.com/groups/1/posts/2')).toBeNull();
  });

  it('skips a non-Facebook link to reach the Facebook one', () => {
    const text = `Listed on https://ikman.lk/en/ad/house — original: ${GROUP_POST}`;
    expect(firstFacebookUrlIn(text)).toBe(GROUP_POST);
  });

  it('does not swallow the punctuation that ended the sentence', () => {
    expect(firstFacebookUrlIn(`Original post: ${GROUP_POST}.`)).toBe(GROUP_POST);
    expect(firstFacebookUrlIn(`(${GROUP_POST})`)).toBe(GROUP_POST);
  });

  /*
   * Whatever comes back is re-vetted by the caller, so it must survive the same
   * parse that admitted it. A lift that yields a string parseFacebookUrl then
   * refuses would read to an operator as "the link I pasted disappeared".
   */
  it('returns something the allowlist still accepts', () => {
    const found = firstFacebookUrlIn(`Check this out ${GROUP_POST} thanks!`);
    expect(found).not.toBeNull();
    expect(parseFacebookUrl(found!)).not.toBeNull();
  });
});

describe('building a draft from the pasted text', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /*
   * THE SPEED-UP, ASSERTED. The entire reason this path exists is that it does
   * not wait on Facebook. If a fetch ever creeps back in here the screen gets
   * slow again with nothing else failing.
   */
  it('makes no network call at all', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    resolveFromPastedText(GROUP_POST, 'House for rent in Nugegoda. Rs 85,000.');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps the operator text verbatim and claims no images', () => {
    const text = 'House for rent in Nugegoda.\n3 bedrooms.\nRs. 85,000 per month.';
    const resolved = resolveFromPastedText(GROUP_POST, text);

    expect(resolved.text).toBe(text);
    expect(resolved.imageUrls).toEqual([]);
    expect(resolved.authorName).toBeNull();
    // 'manual' is the honest label: no upstream served this, a person typed it.
    expect(resolved.resolvedVia).toBe('manual');
    // No note, because there is nothing to warn about — unlike the `og` path,
    // this text is the whole post rather than a truncated preview of it.
    expect(resolved.note).toBeNull();
  });

  it('records the canonical URL, not the one with the tracking query', () => {
    const resolved = resolveFromPastedText(`${GROUP_POST}/?ref=share&mibextid=abc`, 'text');
    expect(resolved.canonicalUrl).toBe(`${GROUP_POST}/`);
  });

  it('labels the platform the same way the fetching path does', () => {
    expect(resolveFromPastedText(GROUP_POST, 'x').platform).toBe('facebook_group');
    expect(
      resolveFromPastedText('https://www.facebook.com/EasyRentLK/posts/123', 'x').platform
    ).toBe('facebook_page');
    expect(
      resolveFromPastedText('https://www.facebook.com/photo/?fbid=123', 'x').platform
    ).toBe('facebook_page');
  });

  /*
   * SKIPPING THE FETCH IS NOT A REASON TO SKIP THE ALLOWLIST. The URL is stored
   * and shown to a reviewer as "the original advert"; a host we would refuse to
   * dereference is not one we want to vouch for in that role either.
   */
  it('still refuses a URL the allowlist would not fetch', () => {
    expect(() => resolveFromPastedText('http://169.254.169.254/', 'text')).toThrow(
      UnsupportedUrlError
    );
    expect(() => resolveFromPastedText('https://facebook.com.evil.com/groups/1/posts/2', 'x'))
      .toThrow(UnsupportedUrlError);
    expect(() => resolveFromPastedText('', 'text')).toThrow(UnsupportedUrlError);
  });
});

describe('the create action takes the fast path', () => {
  const actions = code('app/(dashboard)/back-office/imports/actions.ts');

  it('reads the pasted text off the first screen', () => {
    expect(actions).toMatch(/formData\.get\('rawText'\)/);
  });

  /*
   * The guard that keeps the wait gone. `resolveFromPastedText` is synchronous;
   * an `await resolvePost` reintroduced on the pasted branch would restore the
   * Facebook round trip the operator came here to avoid.
   */
  it('does not ask Facebook when the operator brought the text', () => {
    const pastedBranch = actions.slice(
      actions.indexOf('if (pastedText) {'),
      actions.indexOf('} else {', actions.indexOf('if (pastedText) {'))
    );
    expect(pastedBranch).toContain('resolveFromPastedText');
    expect(pastedBranch).not.toContain('resolvePost');
    expect(pastedBranch).not.toContain('await');
  });

  it('falls back to the link inside the paste when the URL box was left empty', () => {
    expect(actions).toMatch(/firstFacebookUrlIn\(pastedText\)/);
  });

  /*
   * `resolvedVia` records 'manual' for BOTH the fast path and a Facebook login
   * wall, so without this the audit log cannot tell an instant import from a
   * failed fetch — which is the one number that says whether this change worked.
   */
  it('records which path produced the draft', () => {
    expect(actions).toMatch(/pasted: Boolean\(pastedText\)/);
  });
});

describe('the screen works on whatever device it is opened on', () => {
  const form = code('app/(dashboard)/back-office/imports/new/import-url-form.tsx');

  it('offers the post text on the FIRST screen, not only the review one', () => {
    expect(form).toMatch(/<textarea[\s\S]*?name="rawText"/);
  });

  /*
   * iOS autocapitalises and autocorrects a typed URL by default, and a
   * capitalised host is a guaranteed wasted round trip. `inputMode` gets the
   * keyboard with a slash and a .com key rather than a space bar.
   */
  it('never asks a touch keyboard to autocorrect a URL', () => {
    expect(form).toContain('autoCapitalize="off"');
    expect(form).toContain('autoCorrect="off"');
    expect(form).toContain('spellCheck={false}');
    expect(form).toContain('inputMode="url"');
  });

  /*
   * A server action degrades to a plain POST before hydration. Building the
   * FormData by hand in an onSubmit handler would have made the whole import
   * JS-only — on a phone on 3G, the slowest possible moment to require a bundle.
   */
  it('submits through the form action so it works before hydration', () => {
    expect(form).toMatch(/action=\{\(formData\) => start\(\(\) => createImportAction\(formData\)\)\}/);
  });

  /*
   * A pasted advert grows the box past the height of a phone screen. A submit
   * button below it would be off-screen exactly when the form is ready to send.
   */
  it('keeps the submit button reachable under a long paste', () => {
    expect(form).toMatch(/sticky bottom-0/);
  });

  /*
   * `required` must not fight the URL sitting in the paste: the browser would
   * block a submit the server would have handled, with no visible reason why.
   */
  it('only demands the URL box when the text carries no link', () => {
    expect(form).toContain('required={!firstFacebookUrlIn(text)}');
  });

  /*
   * The client hint IMPORTS the server's parser rather than restating it. A
   * second copy of the allowlist drifts, and a hint that disagrees with the
   * gate either blocks a working URL or promises one that will bounce.
   */
  it('validates against the same allowlist the server enforces', () => {
    expect(form).toMatch(/from '@\/lib\/imports\/facebook\/url'/);
    expect(form).toContain('parseFacebookUrl(effectiveUrl)');
  });
});
