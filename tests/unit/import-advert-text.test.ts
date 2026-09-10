import { describe, expect, it } from 'vitest';
import {
  dropDuplicateLeadLine,
  tidyAdvertBullets,
  tidyImportedAdvert,
} from '@/lib/imports/advert-text';
import { importDescription } from '@/lib/imports/publish';

/**
 * The advert behind this file, reported 2026-09-11 — a real Colombo annex post
 * whose imported draft said its own headline twice, rendered its bullets as
 * tofu boxes, and (the part nobody had noticed) published the owner's phone
 * number in the description.
 */
const ADVERT = [
  'Annex for girls',
  '🟩 Colombo - Kirulapone, Polhengoda.',
  '◽️️ Attached bathroom with Hotwater',
  '◽️️ Pantry.',
  '◽️️ Separate entrance.',
  '◽️ 24 hours CCTV coverage.',
  '◽️️ Vehicle parking space available.',
  'Close to Main Roads.',
  'For more info, 071 769 3657',
].join('\n');

/** What resolvePost used to compose: og:title + og:description, and og:description opens with the title. */
const OG_COMPOSED = ['Annex for girls', '', ADVERT].join('\n');

describe('a headline Facebook sent us twice is only published once', () => {
  it('drops the duplicated lead line and the blank run under it', () => {
    expect(dropDuplicateLeadLine(OG_COMPOSED)).toBe(ADVERT);
  });

  it('matches across a trailing full stop and a change of case', () => {
    expect(dropDuplicateLeadLine('Annex For Girls.\n\nannex for girls\nRest')).toBe(
      'annex for girls\nRest'
    );
  });

  it('leaves an advert that genuinely repeats itself further down alone', () => {
    const repeats = 'Annex for girls\nColombo 5\nAnnex for girls\nCall us';
    expect(dropDuplicateLeadLine(repeats)).toBe(repeats);
  });

  it('is a no-op on a single-line advert', () => {
    expect(dropDuplicateLeadLine('Annex for girls')).toBe('Annex for girls');
  });
});

describe('decorative markers do not reach a renter as tofu boxes', () => {
  it('turns a leading marker run into a bullet that any font can render', () => {
    expect(tidyAdvertBullets('◽️️ Pantry.')).toBe('• Pantry.');
    expect(tidyAdvertBullets('🟩 Colombo - Kirulapone, Polhengoda.')).toBe(
      '• Colombo - Kirulapone, Polhengoda.'
    );
  });

  it('collapses a mid-line marker to a space rather than a bullet', () => {
    expect(tidyAdvertBullets('Pantry ◽️ Separate entrance')).toBe('Pantry Separate entrance');
  });

  it('leaves emoji that carry meaning', () => {
    expect(tidyAdvertBullets('🏠 3 bedrooms, 🛏 furnished')).toBe('🏠 3 bedrooms, 🛏 furnished');
  });

  it('leaves an advert with no markers byte-identical', () => {
    expect(tidyAdvertBullets('Spacious annex in Nugegoda.\nCall to view.')).toBe(
      'Spacious annex in Nugegoda.\nCall to view.'
    );
  });

  it('applies both repairs to the reported advert', () => {
    const tidied = tidyImportedAdvert(OG_COMPOSED);
    expect(tidied.match(/Annex for girls/g)).toHaveLength(1);
    expect(tidied).not.toMatch(/[■-◿\u{1F7E0}-\u{1F7EB}]/u);
    expect(tidied).toContain('• Pantry.');
  });
});

/**
 * The prefix test decides whether the text belongs to the operator or to us.
 * `composeDescription` reads whitespace-collapsed text, so a byte-wise compare
 * answers "the operator wrote that" about our own composition — for every
 * advert with a newline in it, which is every real Facebook post.
 */
describe('a multi-line advert is recognised as our composition, not the operator’s', () => {
  const multiline = [
    'Spacious 2BR upstairs annex in Nugegoda, close to the high level road.',
    'Attached bathroom with hot water, pantry and a separate entrance.',
    '24 hours CCTV coverage and vehicle parking space available.',
    'Quiet residential lane, walking distance to schools and supermarkets.',
    'Ideal for a small family or working professionals, long term preferred.',
    'Call 0771234567 to arrange a viewing.',
  ].join('\n');
  const composed = multiline.replace(/\s+/g, ' ').trim();

  it('publishes the advert with its line breaks, not the flattened copy', () => {
    expect(importDescription(composed, multiline)).toContain('\n');
  });

  it('scrubs the phone number out of a multi-line advert', () => {
    expect(importDescription(composed, multiline)).not.toContain('0771234567');
  });

  it('scrubs a number even when the composed text is what gets published', () => {
    // No raw text at all: the composed description is the only candidate, and
    // it used to be returned without ever meeting the scrub.
    expect(importDescription('Lovely annex, call 0771234567 today', null)).not.toContain(
      '0771234567'
    );
  });

  it('never reaches past the scrub to publish what it just removed', () => {
    // Scrubs to nothing, so the old `|| written` fallback republished the number.
    const result = importDescription('0771234567', '0771234567');
    expect(result).not.toContain('0771234567');
    expect(result).toMatch(/^Listed by Easy Rent/);
  });

  it("still leaves the operator's own words alone", () => {
    expect(importDescription('My own careful summary', multiline)).toBe('My own careful summary');
  });
});

describe('the reported advert, end to end', () => {
  it('publishes once, with readable bullets and no phone number', () => {
    const composed = OG_COMPOSED.replace(/\s+/g, ' ').trim();
    const published = importDescription(composed, OG_COMPOSED);

    expect(published.match(/Annex for girls/g)).toHaveLength(1);
    expect(published).toContain('• Pantry.');
    expect(published).not.toContain('071 769 3657');
    expect(published).not.toContain('0717693657');
  });
});
