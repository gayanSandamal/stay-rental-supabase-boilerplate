/**
 * Strip phone numbers a landlord typed into their listing text, unless the
 * number is one they have actually verified.
 *
 * Why this exists at all: `composeDescription` builds the description from the
 * UNMASKED message (the parser masks phones for extraction, but the description
 * keeps the original), so any number a sender writes into their ad lands
 * verbatim on a public listing.
 *
 * Why it belongs to moderation rather than the parser: the exception is
 * "…unless it is one of THIS user's verified numbers", and the parser is pure
 * and has no idea who the sender is. Moderation already owns the row, the owner
 * and the "here is what we changed" message.
 *
 * The product reason: contact happens through verified numbers, so an unverified
 * number pasted into prose is the one route by which an unverified — possibly
 * someone else's — number reaches a renter. It also quietly routes around the
 * verified-badge trust signal the whole marketplace is built on.
 */

import { normalizePhone } from '@/lib/auth/phone-verification';

/**
 * Kept in step with PHONE_RES in lib/intake/parser/rule-parser.ts. Duplicated
 * rather than imported so this module stays free of the parser: they answer
 * different questions (mask-for-extraction vs remove-from-published-text) and
 * should be free to diverge.
 */
const PHONE_PATTERNS = [
  /(?:\+?94[\s-]?|0)7\d(?:[\s-]?\d){7}/g, // SL mobile: 07XXXXXXXX / +947XXXXXXXX
  /0\d{2}[\s-]?\d{7}/g, // SL landline: 0112345678 / 011-2345678
  /\+\d{10,13}/g, // generic international
];

export interface ScrubResult {
  cleaned: string;
  /** Normalized numbers removed, deduped. Digits stay server-side. */
  removed: string[];
  /** Numbers left alone because the owner has verified them. */
  kept: string[];
}

/**
 * Remove every phone number from `text` except those in `allowed`.
 *
 * `allowed` is compared in E.164 via normalizePhone, so a landlord who verified
 * +94771234567 keeps it whether they typed it as 0771234567 or 077 123 4567.
 */
export function scrubContactNumbers(
  text: string | null | undefined,
  allowed: Array<string | null | undefined>
): ScrubResult {
  const source = text ?? '';
  if (!source) return { cleaned: '', removed: [], kept: [] };

  const allowSet = new Set(
    allowed.map((a) => normalizePhone(a)).filter((a): a is string => Boolean(a))
  );

  const removed = new Set<string>();
  const kept = new Set<string>();
  let out = source;

  for (const pattern of PHONE_PATTERNS) {
    // Swallow the connector that introduces the number, so "Call me on
    // 0777654321 today" becomes "Call me today" rather than "Call me on today".
    // normalizePhone strips non-digits, so the wider match still resolves.
    const withLeadIn = new RegExp(
      String.raw`(?:\s+(?:on|at|to))?\s*[:\-\u2013\u2014]?\s*` + pattern.source,
      pattern.flags
    );
    out = out.replace(withLeadIn, (match) => {
      const e164 = normalizePhone(match);
      // Unparseable digits are left alone: this removes CONTACT numbers, and a
      // shape we cannot even normalize is more likely a reference or a price
      // than someone's phone.
      if (!e164) return match;
      if (allowSet.has(e164)) {
        kept.add(e164);
        return match;
      }
      removed.add(e164);
      return '';
    });
  }

  return { cleaned: removed.size ? tidy(out) : out, removed: [...removed], kept: [...kept] };
}

/**
 * Close the hole a removed number leaves. "Call me on 0771234567 today" must
 * not publish as "Call me on  today", and a number on its own line must not
 * leave a blank one.
 */
function tidy(text: string): string {
  return text
    // Dangling lead-ins left pointing at nothing.
    .replace(/\b(?:call|whatsapp|contact|tel|phone|hotline|dial)\b[\s:–—-]*(?=[.,;]|$)/gi, '')
    // Punctuation orphaned by the removal.
    .replace(/[ \t]*([.,;:])[ \t]*\1+/g, '$1')
    .replace(/\(\s*\)|\[\s*\]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line, i, arr) => line.length > 0 || (i > 0 && arr[i - 1].length > 0))
    .join('\n')
    .trim();
}

/** The line the landlord sees. Deliberately does not echo the digits back. */
export function contactRemovedLine(count: number): string {
  return count === 1
    ? 'We removed a phone number from your description — renters reach you on your verified number, shown on the listing.'
    : `We removed ${count} phone numbers from your description — renters reach you on your verified number, shown on the listing.`;
}
