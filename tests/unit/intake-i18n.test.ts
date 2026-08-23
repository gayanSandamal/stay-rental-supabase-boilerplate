import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogueFor } from '@/lib/intake/i18n';
import {
  deleteCancelledMessage,
  deleteConfirmMessage,
  deleteDoneMessage,
  helpMessage,
  needsInfoMessage,
  receivedAckMessage,
  manualReviewPendingMessage,
  pendingReviewMessage,
  stuckMessage,
  photosAddedMessage,
  publishedMessage,
  socialConsentPrompt,
  summarizeUnderstood,
} from '@/lib/intake/messages';
import { detectCommand, isAffirmative, isCancel } from '@/lib/intake/commands';

/**
 * Guardrails for translated landlord copy.
 *
 * Two failure modes matter more than wording:
 *
 *  1. A translation silently dropping an OPERATIVE keyword. The copy tells the
 *     landlord to reply DELETE / CANCEL / RESTORE / YES, and `commands.ts` is
 *     what matches those. A Sinhala string that reads beautifully but never says
 *     "DELETE" leaves the landlord unable to remove their own listing.
 *  2. The English path drifting. English is 100% of live traffic today, and the
 *     flag defaults OFF, so English output must be exactly what it was.
 */

// The flag is read inside t(), so it is mocked at the module rather than
// spied on an import binding.
const flagOn = vi.hoisted(() => ({ value: false }));

vi.mock('@/lib/feature-flags', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/feature-flags')>();
  return {
    ...actual,
    isFeatureEnabled: (flag: string) =>
      flag === 'enableLocalizedReplies' ? flagOn.value : actual.isFeatureEnabled(flag as never),
  };
});

const enableFlag = (on: boolean) => {
  flagOn.value = on;
};

afterEach(() => enableFlag(false));

describe('flag off — English is untouched', () => {
  it('every builder ignores lang when the flag is off', () => {
    enableFlag(false);
    // Even asked for Sinhala, the output is the English literal.
    expect(receivedAckMessage('Gayan', 'si')).toBe(receivedAckMessage('Gayan', 'en'));
    expect(needsInfoMessage('Gayan', ['rentPerMonth'], null, {}, 'si')).toBe(
      needsInfoMessage('Gayan', ['rentPerMonth'], null, {}, 'en')
    );
    expect(helpMessage('ta')).toBe(helpMessage('en'));
  });

  it('the English needs-info line is byte-for-byte what production sends', () => {
    enableFlag(false);
    // The exact string the landlord in the incident received.
    expect(
      needsInfoMessage('Gayan Sandamal', ['rentPerMonth'], null, {
        understood: 'a 3-bedroom house in Padukka',
      })
    ).toBe(
      'Thanks Gayan Sandamal! Got it — a 3-bedroom house in Padukka. ' +
        'To publish we still need: the monthly rent. Just reply here with the details.'
    );
  });
});

describe('flag on — Sinhala', () => {
  it('names the missing field in Sinhala, not just the sentence around it', () => {
    enableFlag(true);
    const msg = needsInfoMessage('Gayan', ['rentPerMonth'], null, {}, 'si');
    // The whole point: "the monthly rent" translated, not left in English.
    expect(msg).toContain('මාසික කුලිය');
    expect(msg).not.toContain('the monthly rent');
  });

  it('joins several missing fields with the Sinhala conjunction', () => {
    enableFlag(true);
    const msg = needsInfoMessage('Gayan', ['city', 'rentPerMonth'], null, {}, 'si');
    expect(msg).toContain('නගරය');
    expect(msg).toContain('මාසික කුලිය');
    expect(msg).toContain('සහ');
    expect(msg).not.toMatch(/\band\b/);
  });

  it('renders the sale-ad reply instead of asking for a rent', () => {
    enableFlag(true);
    const msg = needsInfoMessage('Gayan', ['rentPerMonth'], null, { looksLikeSaleAd: true }, 'si');
    expect(msg).toContain('Easy Rent');
    expect(msg).toContain('විකිණීමට'); // "for sale"
    // It must NOT read as a plain missing-field ask.
    expect(msg).not.toContain('තව අවශ්‍යයි');
  });

  it('echoes what was understood as an unambiguous list', () => {
    enableFlag(true);
    const echo = summarizeUnderstood(
      { propertyType: 'house', bedrooms: 3, city: 'Padukka' },
      'si'
    );
    expect(echo).toContain('නිදන කාමර 3');
    expect(echo).toContain('නිවසක්');
    expect(echo).toContain('Padukka');
  });

  it('leaves no unreplaced {placeholder} anywhere', () => {
    enableFlag(true);
    const rendered = [
      receivedAckMessage('Gayan', 'si'),
      needsInfoMessage('Gayan', ['city'], null, {}, 'si'),
      deleteConfirmMessage('2BR House', 'si'),
      deleteDoneMessage('2BR House', 'si'),
      socialConsentPrompt('2BR House', 'si'),
      helpMessage('si'),
    ];
    for (const msg of rendered) expect(msg).not.toMatch(/\{[a-z]+\}/i);
  });
});

describe('operative keywords survive translation', () => {
  // These are the strings commands.ts must still recognise after the landlord
  // reads a translated instruction and types back what it told them to.
  it.each(['si', 'ta'] as const)('%s delete copy still says DELETE and CANCEL', (lang) => {
    enableFlag(true);
    expect(deleteConfirmMessage('House', lang)).toContain('DELETE');
    expect(deleteDoneMessage('House', lang)).toContain('RESTORE');
    expect(deleteCancelledMessage(lang)).toContain('DELETE');
    expect(helpMessage(lang)).toContain('LINK');
  });

  it.each(['si', 'ta'] as const)('%s consent copy offers a YES commands.ts accepts', (lang) => {
    enableFlag(true);
    const prompt = socialConsentPrompt('House', lang);
    expect(prompt).toContain('YES');
    // And the native word it also offers is genuinely accepted.
    const native = lang === 'si' ? 'ඔව්' : 'ஆம்';
    expect(prompt).toContain(native);
    expect(isAffirmative(native)).toBe(true);
  });

  it('the keywords the copy names are the ones commands.ts matches', () => {
    // Belt and braces: if someone rewrites DELETE_RE, this fails here too.
    expect(detectCommand('DELETE')).toBe('delete');
    expect(isCancel('CANCEL')).toBe(true);
    expect(isAffirmative('YES')).toBe(true);
  });
});

describe('catalogue hygiene', () => {
  it('Sinhala and Tamil cover the same keys', () => {
    // Divergence means one language quietly falls back to English for a message
    // the other translates — the kind of gap nobody notices in review.
    expect(Object.keys(catalogueFor('si')).sort()).toEqual(Object.keys(catalogueFor('ta')).sort());
  });

  it('no translation is blank', () => {
    for (const lang of ['si', 'ta'] as const) {
      for (const [key, value] of Object.entries(catalogueFor(lang))) {
        expect(value, `${lang}.${key}`).toBeTruthy();
        expect(String(value).trim(), `${lang}.${key}`).not.toBe('');
      }
    }
  });
});

describe('regressions from the 2026-08-23 half-translated reply', () => {
  // The landlord got a Sinhala first line followed by English "You can change
  // the details meanwhile", "Or remove it", and "We show up to 6 photos per
  // listing". Localising the headline of a composite message is not localising
  // the message.

  /** Latin text that is legitimately Latin in any language. */
  const ALLOWED_LATIN = [
    /https?:\/\/\S+/g, // links
    /Easy Rent/g, // brand
    /WhatsApp/g, // brand
    /\b(?:DELETE|CANCEL|RESTORE|LINK|YES|NO)\b/g, // operative keywords, on purpose
  ];

  /** Any English word left over once the legitimate Latin is removed. */
  function leftoverEnglish(msg: string): string[] {
    let stripped = msg;
    for (const re of ALLOWED_LATIN) stripped = stripped.replace(re, ' ');
    return stripped.match(/[A-Za-z]{4,}/g) ?? [];
  }

  it('pendingReview is fully Sinhala, links and photo note included', () => {
    enableFlag(true);
    const msg = pendingReviewMessage(
      'පාදුක්ක නිවස',
      { editUrl: 'https://easyrent.lk/l/tok/e/24', deleteUrl: 'https://easyrent.lk/l/tok/d/24' },
      { photosOverCap: 3, photoCap: 6 },
      'si'
    );
    expect(leftoverEnglish(msg)).toEqual([]);
  });

  it.each(['si', 'ta'] as const)('%s published message leaves no English behind', (lang) => {
    enableFlag(true);
    const msg = publishedMessage(
      'පාදුක්ක නිවස',
      {
        viewUrl: 'https://easyrent.lk/listings/24',
        editUrl: 'https://easyrent.lk/l/tok/e/24',
        deleteUrl: 'https://easyrent.lk/l/tok/d/24',
      },
      { unsupportedMedia: true, photosOverCap: 2, photoCap: 6 },
      lang
    );
    expect(leftoverEnglish(msg)).toEqual([]);
  });

  it.each(['si', 'ta'] as const)('%s manual-review holding message is translated', (lang) => {
    enableFlag(true);
    // This is the "Our team is reviewing your listing" line the landlord was
    // left staring at, in English, under a Sinhala thread.
    expect(leftoverEnglish(manualReviewPendingMessage(lang))).toEqual([]);
  });

  it.each(['si', 'ta'] as const)('%s stuck message is translated', (lang) => {
    enableFlag(true);
    // Sent INSTEAD of a third question. A landlord who has already answered
    // twice reading an English paragraph would be the same failure again.
    // No name: a landlord's own name is legitimately Latin in any language.
    expect(leftoverEnglish(stuckMessage(null, lang))).toEqual([]);
  });

  it.each(['si', 'ta'] as const)('%s photosAdded uses its catalogue key', (lang) => {
    enableFlag(true);
    // The key existed but was never wired to the builder — it rendered English
    // while the catalogue claimed coverage.
    expect(leftoverEnglish(photosAddedMessage('පාදුක්ක නිවස', 2, 1, { overCap: 2 }, lang))).toEqual([]);
  });
});

describe('no dangling catalogue keys', () => {
  it('every key is actually referenced by a builder', async () => {
    // photosAdded shipped as a translation nobody could ever see, because the
    // builder was never wired to it. Parity between si and ta did not catch it:
    // both were equally unreachable.
    const fs = await import('node:fs/promises');
    const sources = (
      await Promise.all(
        ['lib/intake/messages.ts', 'lib/moderation/notify.ts'].map((f) => fs.readFile(f, 'utf8'))
      )
    ).join('\n');

    const unreferenced = Object.keys(catalogueFor('si')).filter((key) => {
      // Field labels are looked up dynamically as `field.${f}` / `type.${t}`.
      if (key.startsWith('field.') || key.startsWith('type.')) return false;
      return !sources.includes(`'${key}'`);
    });
    expect(unreferenced).toEqual([]);
  });
});
