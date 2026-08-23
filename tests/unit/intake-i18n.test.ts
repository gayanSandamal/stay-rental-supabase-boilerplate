import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogueFor } from '@/lib/intake/i18n';
import {
  deleteCancelledMessage,
  deleteConfirmMessage,
  deleteDoneMessage,
  helpMessage,
  needsInfoMessage,
  receivedAckMessage,
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
