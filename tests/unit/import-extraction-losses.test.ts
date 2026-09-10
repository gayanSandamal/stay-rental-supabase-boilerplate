import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractPhoneNumbers } from '@/lib/moderation/contact-scrub';
import { extractOwnerName } from '@/lib/imports/extract';
import { importDescription } from '@/lib/imports/publish';
import { isAllowedImageHost } from '@/lib/imports/facebook/url';
import { inviteCommentText, parseInviteReference } from '@/lib/imports/invite';

/**
 * "The import loses the photos, cuts the caption, and misses the phone and the
 * name."
 *
 * Most of that is Facebook: a logged-out request gets the OpenGraph preview and
 * nothing else, verified live on 2026-09-08 with the post body absent from the
 * whole 346 KB response (docs/deep-dive-facebook-post-import.md). These cover
 * the part that WAS ours — the paste we discarded, the description we clipped,
 * the quote that amputated a meta tag, and the numbers the regex could not see.
 */
function code(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('the paste survives every button on the review screen', () => {
  const form = code('app/(dashboard)/back-office/imports/[id]/review-form.tsx');
  const actions = code('app/(dashboard)/back-office/imports/actions.ts');

  /*
   * THE REGRESSION GUARD. The Post-text textarea lives in the re-extract
   * <form>; Save and Publish submit a different one. Without a mirror, an
   * operator who pasted the whole advert and pressed "Save draft" lost it —
   * and the phone chips, which are recomputed from the STORED text, stayed
   * empty, so it read as "extraction is broken" rather than "we dropped it".
   */
  it('mirrors the post text into the form Save and Publish submit', () => {
    expect(form).toMatch(/<input[^>]*type="hidden"[^>]*name="rawText"/);
  });

  it('keeps the textarea controlled, or the mirror would go stale', () => {
    expect(form).toContain('value={postText}');
    expect(form).toContain('setPostText(e.target.value)');
  });

  it('persists rawText from BOTH save and publish, not just the re-extract', () => {
    // Three writers now: reExtractAction, updateDraftAction, publishImportAction.
    expect(actions.match(/rawText[,:]/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(actions).toContain('keepRawText(formData, existing.rawText)');
  });

  it('never blanks stored text when the field is absent from a submission', () => {
    // `||` and not `??`: an absent field and an emptied one both arrive as ''.
    expect(code('app/(dashboard)/back-office/imports/actions.ts')).toContain(
      'return posted || existing;'
    );
  });
});

describe('phone numbers as Sri Lankan adverts actually write them', () => {
  const first = (text: string) => extractPhoneNumbers(text)[0] ?? null;

  it.each([
    ['plain local', 'Call 0771234567', '+94771234567'],
    ['spaced', 'Call 077 123 4567', '+94771234567'],
    ['dot separated', 'Call 077.123.4567', '+94771234567'],
    ['parenthesised country code', 'Call +94 (77) 123 4567', '+94771234567'],
    ['en dash', 'Call 077–1234567', '+94771234567'],
    ['00 international prefix', 'Call 0094771234567', '+94771234567'],
    ['landline in brackets', 'Office (011) 2345678', '+94112345678'],
  ])('reads a %s number', (_label, text, expected) => {
    expect(first(text)).toBe(expected);
  });

  /*
   * A WRONG number is worse than none. It is where an unrepeatable consent
   * request gets sent, and it creates an account against a stranger.
   */
  it('refuses an over-long digit run rather than inventing a number from its prefix', () => {
    expect(extractPhoneNumbers('Reference 0771234567890 here')).toEqual([]);
  });

  it('still does not read a price as a phone number', () => {
    expect(extractPhoneNumbers('Rent Rs 85,000 per month')).toEqual([]);
  });

  /*
   * The separator run is capped at two characters precisely so a dash BETWEEN
   * two figures cannot glue them into one number: unlimited separators turn
   * "Rs. 25,000 - 0112345678" into "000 - 0112345" and a confident +94000112345.
   */
  it('does not weld a price and a number together across " - "', () => {
    expect(extractPhoneNumbers('Rs. 25,000 - 0112345678 only')).toEqual(['+94112345678']);
  });
});

describe('the owner name, when the advert labels one', () => {
  it.each([
    ['Contact Nimal 0771234567', 'Nimal'],
    ['Call Saman Perera on 077 123 4567', 'Saman Perera'],
    ['Whatsapp: Kamal — 0771234567', 'Kamal'],
    ['Mr. Fernando 0112345678', 'Fernando'],
    ['විස්තර සඳහා අමතන්න සුනිල් 0771234567', 'සුනිල්'],
  ])('reads a name out of %s', (text, expected) => {
    expect(extractOwnerName(text)).toBe(expected);
  });

  /*
   * greetingName(null) renders "Hi there", which is a normal way to open a
   * message. "Hi Now," is not — so a false positive costs more than a miss.
   */
  it.each([
    'Please contact us on 0771234567',
    'Call now 0771234567',
    'Contact owner 0771234567',
    'contact for viewing 0771234567',
    'Rent 85000, no name here 0771234567',
  ])('returns null rather than guess for %s', (text) => {
    expect(extractOwnerName(text)).toBeNull();
  });
});

describe('the published description is the whole advert, not 400 characters of it', () => {
  const advert =
    'Spacious 2BR upstairs annex in Nugegoda, close to the high level road. '.repeat(8) +
    'Call 0771234567 to arrange a viewing.';
  const autoClipped = advert.slice(0, 380).trimEnd() + '…';

  it('replaces the auto-clip with the full text', () => {
    expect(importDescription(autoClipped, advert).length).toBeGreaterThan(400);
  });

  it('scrubs the phone number the longer text now carries', () => {
    // An imported number is verified:false, and moderateListing only scrubs
    // when moderation is ARMED — with it disarmed this insert goes live unread.
    expect(importDescription(autoClipped, advert)).not.toContain('0771234567');
  });

  it("leaves the operator's own words completely alone", () => {
    expect(importDescription('My own careful summary', advert)).toBe('My own careful summary');
  });

  it('falls back to the boilerplate when there is nothing at all', () => {
    expect(importDescription(null, null)).toMatch(/^Listed by Easy Rent/);
  });
});

describe('a meta tag is not amputated by an apostrophe', () => {
  const fetchSource = code('lib/imports/facebook/fetch.ts');

  it('back-references the opening quote instead of excluding both', () => {
    expect(fetchSource).toContain('content=(["\'])([\\s\\S]*?)\\1');
    expect(fetchSource).not.toContain('content=["\']([^"\']*)["\']');
  });

  it('has ONE parse of the content attribute, so the two cannot drift again', () => {
    expect(fetchSource).toContain('return metaContentAll(html, property)[0] ?? null;');
  });
});

describe('pasted image URLs are an SSRF surface before they are a convenience', () => {
  it.each(['scontent-lhr8-1.xx.fbcdn.net', 'fbcdn.net', 'scontent.fcmb1-2.fna.fbcdn.net'])(
    'allows Facebook CDN host %s',
    (host) => {
      expect(isAllowedImageHost(host)).toBe(true);
    }
  );

  it.each([
    'evil-fbcdn.net', // the exact trap a bare endsWith() falls into
    '169.254.169.254',
    'localhost',
    'facebook.com.evil.com',
    'fbcdn.net.evil.com',
  ])('refuses %s', (host) => {
    expect(isAllowedImageHost(host)).toBe(false);
  });

  it('vets every redirect hop, not only the pasted host', () => {
    const fetchSource = code('lib/imports/facebook/fetch.ts');
    const guarded = fetchSource.slice(fetchSource.indexOf('export async function fetchPastedImage'));
    expect(guarded).toContain('fetchAllowlisted(url, isAllowedImageHost)');
    // fetchOriginal is a bare fetch with redirect: 'follow' — never for typed input.
    expect(guarded).not.toContain('fetchOriginal');
  });
});

describe('the invite comment', () => {
  it('round-trips its reference out of a reply', () => {
    expect(parseInviteReference('Hi Easy Rent — this is my property. FB-41')).toBe(41);
    expect(parseInviteReference('hi, ref fb-7 thanks')).toBe(7);
  });

  it('ignores a message with no reference', () => {
    expect(parseInviteReference('2BR annex in Nugegoda, 85000')).toBeNull();
    expect(parseInviteReference(null)).toBeNull();
  });

  it('carries the reference so ops can match the reply to the draft', () => {
    expect(inviteCommentText(41)).toContain('FB-41');
  });

  it('says the listing is free of charge, never "affordable"', () => {
    const text = inviteCommentText(1).toLowerCase();
    expect(text).toContain('free of charge');
    expect(text).not.toContain('affordable');
    expect(text).not.toContain('best value');
  });

  it('never claims we have already listed their property', () => {
    // The whole point of this channel is that we have not.
    expect(inviteCommentText(1)).not.toMatch(/we (?:have )?listed it/i);
    expect(inviteCommentText(1)).toContain('If this is your property');
  });
});

describe('images are capped where the manifest can record it', () => {
  const extract = code('lib/imports/extract.ts');

  it('no longer drops over-cap photos at ingest with a bare break', () => {
    expect(extract).not.toContain('if (stored.length >= cap) break;');
  });

  it('leaves the listing cap to publish, which records rejects in the manifest', () => {
    const publish = code('lib/imports/publish.ts');
    expect(publish).toContain('capPhotos(parsePhotoUrls(record.photoUrls), cap)');
    expect(publish).toContain('capRejectEntries(dropped, cap)');
  });
});
