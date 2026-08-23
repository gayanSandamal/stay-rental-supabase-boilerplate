/**
 * Which language do we reply to this landlord in?
 *
 * A landlord sent a complete property ad in Sinhala and got back
 * "To publish we still need: the monthly rent" — in English. Naming the missing
 * field in a language the landlord did not write in is barely better than not
 * naming it, and WhatsApp is the intake channel for a Sri Lankan market.
 *
 * Detection is NOT new: `analyzeScript()` in lib/moderation/language.ts already
 * does deterministic Unicode script analysis, with a 10% share threshold tuned
 * for exactly these ads — Sinhala prose peppered with Latin digits, town names,
 * "sqft" and phone numbers. This is a thin wrapper over it.
 */

import { analyzeScript } from '@/lib/moderation/language';

export type ReplyLang = 'en' | 'si' | 'ta';

const LANGS: ReplyLang[] = ['en', 'si', 'ta'];

export function isReplyLang(value: string | null | undefined): value is ReplyLang {
  return typeof value === 'string' && (LANGS as string[]).includes(value);
}

/**
 * The language a single message is written in, or null when the text cannot
 * settle it.
 *
 * `latn` deliberately returns null rather than 'en': Latin script only tells us
 * "not Sinhala or Tamil", and a landlord mid-conversation answering "50000" or
 * "ok" must not be read as switching to English. `resolveReplyLang` is what
 * turns an inconclusive reading into a decision.
 */
export function replyLangFromText(text: string): ReplyLang | null {
  const { verdict } = analyzeScript(text ?? '');
  switch (verdict) {
    case 'si':
    // A bilingual ad gets Sinhala: it is the larger audience, and replying in
    // one of the two languages the landlord actually used beats English.
    case 'si+ta':
      return 'si';
    case 'ta':
      return 'ta';
    default:
      // 'latn' | 'other' | 'unknown' — not conclusive on its own.
      return null;
  }
}

/**
 * The language for the NEXT reply in a conversation.
 *
 * This is the behaviour that matters most. A landlord writes a long Sinhala ad
 * (conclusively `si`), then replies "50000" — which on its own is `unknown`.
 * Detecting per message would flip them back to English halfway through their
 * own submission. So a stored language wins, and is only replaced when the new
 * message is itself conclusive (they genuinely switched).
 *
 * With nothing stored and nothing conclusive, English is the safe default:
 * every landlord can read the English copy, which is not true in reverse.
 */
export function resolveReplyLang(stored: string | null | undefined, text?: string): ReplyLang {
  const detected = text ? replyLangFromText(text) : null;
  if (detected) return detected;
  if (isReplyLang(stored)) return stored;
  return 'en';
}
