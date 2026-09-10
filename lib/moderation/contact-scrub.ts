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
 * Started as a copy of PHONE_RES in lib/intake/parser/rule-parser.ts and has
 * now DIVERGED, which that module's own comment anticipated: the two answer
 * different questions (mask-for-extraction vs read-an-advert) and are free to.
 *
 * The divergence is deliberate and one-directional. Widening the parser's copy
 * changes what every WhatsApp intake extracts, so it needs a RULES_VERSION bump
 * (currently 5) and a `pnpm parser:probe` re-run; this copy only reads numbers
 * out of a Facebook advert for an operator to confirm, so it can be widened on
 * its own. If the parser's copy is ever widened to match, do it as its own
 * change with the probe.
 *
 * WHAT CHANGED AND WHY:
 *
 *  - SEPARATORS. `[\s-]` matched a space or an ASCII hyphen and nothing else,
 *    so `077.123.4567`, `+94 (77) 123 4567` and an en-dash `077–1234567` — all
 *    ordinary in Sri Lankan adverts — were invisible.
 *  - AT MOST TWO separator characters per gap, not unlimited. `") "` and `" ("`
 *    have to fit; `" - "` must not, or `Rs. 25,000 - 0112345678` matches
 *    "000 - 0112345" and yields a confident, wholly invented +94000112345.
 *  - BOUNDARIES. Without `(?!\d)` the mobile pattern read `0771234567890` as
 *    `0771234567` and normalised it to a real-looking number belonging to
 *    nobody. A wrong number here is worse than no number: it is the address an
 *    unrepeatable consent request gets sent to.
 *  - `00` prefix. `0094771234567` is how a number written for an international
 *    reader appears; normalizePhone already understood it, the matcher did not.
 */
const SEP = '[\\s.()\\-\\u2010-\\u2015]{0,2}';
const PHONE_PATTERNS = [
  // SL mobile: 07XXXXXXXX / +947XXXXXXXX / 00947XXXXXXXX, any separators above
  new RegExp(`(?<!\\d)(?:(?:\\+|00)?94${SEP}|0)7\\d(?:${SEP}\\d){7}(?!\\d)`, 'g'),
  // SL landline: 0112345678 / 011-2345678 / (011) 2345678
  new RegExp(`(?<!\\d)0\\d{2}${SEP}\\d(?:${SEP}\\d){6}(?!\\d)`, 'g'),
  // generic international
  new RegExp(`(?<!\\d)\\+${SEP}\\d(?:${SEP}\\d){9,12}(?!\\d)`, 'g'),
];

/**
 * Every phone number in `text`, normalised to E.164 and deduped.
 *
 * The mirror image of `scrubContactNumbers`, over the same patterns: that one
 * asks "which of these may stay published", this one asks "who wrote this ad".
 * Used by the Facebook importer to offer an operator the numbers a landlord put
 * in their own post — candidates to CONFIRM, never a number to message on the
 * strength of a regex.
 *
 * Order is preserved (first written first), because Sri Lankan ads lead with
 * the number to call and follow it with an agent's or a landline.
 */
export function extractPhoneNumbers(text: string | null | undefined): string[] {
  if (!text) return [];

  const hits: Array<{ index: number; e164: string }> = [];
  const seen = new Set<string>();

  for (const pattern of PHONE_PATTERNS) {
    // Fresh regex per call: PHONE_PATTERNS carry /g, and a shared lastIndex
    // between calls makes the second read of the same text skip matches.
    for (const match of text.matchAll(new RegExp(pattern.source, pattern.flags))) {
      const e164 = normalizePhone(match[0]);
      if (!e164 || seen.has(e164)) continue;
      seen.add(e164);
      hits.push({ index: match.index ?? 0, e164 });
    }
  }

  return hits.sort((a, b) => a.index - b.index).map((hit) => hit.e164);
}

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
