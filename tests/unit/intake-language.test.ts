import { describe, expect, it } from 'vitest';
import { replyLangFromText, resolveReplyLang } from '@/lib/intake/language';

/**
 * Which language we answer a landlord in.
 *
 * The motivating incident: a landlord sent this exact ad in Sinhala and was
 * told, in English, that the monthly rent was missing.
 */

/** The real text of intake #28, verbatim. */
const SINHALA_AD = `💥  හොරණ නගරයට ආසන්නව වට්නා නිවසක් බදු දීමට ඇත.

💥  හොරණ නගරයට 5km යි

💥  මොරගහාහේන නගරයට 2 km යි

💥  පර්චස් 30 යි

💥  නිදන කාමර 3 යි  නාන කාමර 2 යි සාලය කෑම කාමරය මුලුතැන්ගෙය.

💥  විස්‍තර 0770253815  ගයාන්`;

const TAMIL_AD = 'வாடகைக்கு வீடு கொழும்பு 3 அறைகள் வாடகை 45,000';

describe('replyLangFromText', () => {
  it('reads the real Sinhala ad as Sinhala despite its Latin digits', () => {
    // The ad is mostly Sinhala but carries "5km", "30", "0770253815". A
    // majority-share rule would call this Latin; analyzeScript's 10% threshold
    // is tuned for exactly this.
    expect(replyLangFromText(SINHALA_AD)).toBe('si');
  });

  it('reads a Tamil ad as Tamil', () => {
    expect(replyLangFromText(TAMIL_AD)).toBe('ta');
  });

  it('answers a bilingual ad in Sinhala', () => {
    expect(replyLangFromText(`${SINHALA_AD}\n${TAMIL_AD}`)).toBe('si');
  });

  it('returns null — not "en" — for Latin text', () => {
    // Latin only means "not Sinhala or Tamil". Treating it as a positive vote
    // for English is what would break a mid-conversation reply.
    expect(replyLangFromText('3 bedroom house in Kandy, rent 60000')).toBeNull();
  });

  it('returns null for a bare number or emoji', () => {
    expect(replyLangFromText('50000')).toBeNull();
    expect(replyLangFromText('👍')).toBeNull();
    expect(replyLangFromText('')).toBeNull();
  });
});

describe('resolveReplyLang', () => {
  it('THE TRAP: a bare "50000" reply does not revert a Sinhala conversation', () => {
    // The landlord writes the Sinhala ad, we ask for the rent, they answer
    // "50000". Detecting per message would answer that in English — halfway
    // through their own submission.
    const first = resolveReplyLang(null, SINHALA_AD);
    expect(first).toBe('si');
    expect(resolveReplyLang(first, '50000')).toBe('si');
    expect(resolveReplyLang(first, 'ok')).toBe('si');
    expect(resolveReplyLang(first, '👍')).toBe('si');
  });

  it('still switches when the landlord genuinely changes script', () => {
    expect(resolveReplyLang('si', TAMIL_AD)).toBe('ta');
    expect(resolveReplyLang('ta', SINHALA_AD)).toBe('si');
  });

  it('defaults to English with nothing stored and nothing conclusive', () => {
    // Safe direction: every landlord can read the English copy; the reverse
    // is not true.
    expect(resolveReplyLang(null, 'hi')).toBe('en');
    expect(resolveReplyLang(null)).toBe('en');
  });

  it('keeps a stored language when there is no new text at all', () => {
    // Later sends — the go-live notice, the social results message — happen
    // with no inbound message to read.
    expect(resolveReplyLang('si')).toBe('si');
    expect(resolveReplyLang('ta')).toBe('ta');
  });

  it('ignores a stored value that is not a language we support', () => {
    expect(resolveReplyLang('klingon', 'hello')).toBe('en');
    expect(resolveReplyLang('', 'hello')).toBe('en');
  });
});
