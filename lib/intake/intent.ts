/**
 * Is this message someone LISTING a property, or someone LOOKING for one?
 *
 * WHY THIS EXISTS. A landlord's advert and a tenant's search carry an identical
 * vocabulary — town, bedrooms, a number of rupees. `hasListingDetail` answers
 * true for both, and nothing in the rule parser reads the comparator, so
 * "Maharagama, 2 bedrooms, under 70k" was extracted as a property whose rent is
 * 70,000 and published as a listing: the tenant's own phone number became the
 * public contact on a house they do not own, and their account was flipped to
 * `landlord`. This module is the discriminator that was missing.
 *
 * THE ASYMMETRY THAT DECIDES THE DESIGN. Getting it wrong in the two directions
 * costs very different amounts:
 *
 *   search misread as a listing  → a fake listing, a stranger's number
 *                                  published, an account silently converted.
 *                                  Damaging and invisible to the sender until
 *                                  it is live.
 *   listing misread as a search  → the landlord gets search results and has to
 *                                  rephrase. Annoying, recoverable, obvious.
 *
 * So this never guesses between them. Only decisive signals decide; everything
 * else returns `ambiguous`, and the caller asks. One extra tap is cheap, and it
 * is the same choice the town disambiguation already makes — on WhatsApp there
 * is always someone to ask.
 *
 * DEGRADING SAFELY. A phrase this module has not been taught falls through to
 * `ambiguous`, not to `listing`. That matters for the Sinhala and Tamil token
 * lists below, which are deliberately small: an unrecognised word costs a
 * question, never a fabricated listing.
 */

import type { NormalizedInboundMessage } from './channels/types';
import type { ParsedIntake } from './parser/types';
import { extractPhoneNumbers } from '@/lib/moderation/contact-scrub';

export type MessageIntent = 'listing' | 'search' | 'ambiguous';

export interface IntentContext {
  /**
   * The sender already has an intake in flight. Prior context always wins: a
   * landlord halfway through a submission is never reinterpreted mid-flow.
   */
  hasOpenIntake: boolean;
}

/**
 * A ceiling, a floor or a range — the one structural difference between "the
 * rent is 70k" and "my budget is 70k". English carries the load because Sri
 * Lankan rental messages are overwhelmingly written with English numerals and
 * comparators even when the rest is Sinhala or Tamil.
 */
const BUDGET_COMPARATOR_RE =
  /\b(?:under|below|less\s+than|no\s+more\s+than|max(?:imum)?|up\s?to|upto|within|budget|around|between)\b|අඩු|වඩා\s*අඩු|குறைவாக|வரை/i;

/**
 * Someone asking, rather than offering. Deliberately excludes a bare "want" and
 * a bare "need": "I want to rent out my annex" is a landlord, and the whole
 * point of this module is not to get that backwards.
 */
const SEEKING_RE =
  /\b(?:looking\s+for|look(?:ing)?\s+to\s+rent|searching\s+for|search\s+for|in\s+search\s+of|need\s+an?\b|needed\b|wanted\b|anyone\s+(?:have|know)|do\s+you\s+have|any\s+\w+\s+available|find\s+me|show\s+me|got\s+any)\b|හොයනවා|தேடுகிறேன்/i;

/**
 * Someone OFFERING a property, stated in words rather than shown in detail.
 *
 * The mirror of SEEKING_RE, and it exists for the same reason: once a message
 * carrying no listing detail asks the intent question instead of assuming a
 * listing, "I want to list my house" would be asked about too — and that
 * sentence is not ambiguous by any reading. A landlord who says plainly what
 * they are doing should never be made to confirm it.
 *
 * Checked AFTER the seeking signals, so "looking for a house for rent" stays a
 * search: the seeking phrase is the deliberate one and already returned.
 */
const OFFERING_RE =
  /\b(?:rent(?:ing)?\s+out|let(?:ting)?\s+out|to\s+let|for\s+rent|on\s+rent|list(?:ing)?\s+(?:my|our|a|this)|post(?:ing)?\s+an?\s+ad|advertise|put\s+up\s+(?:my|our)|give\s+(?:my|our)\b|available\s+(?:for\s+rent|to\s+rent|from))\b|කුලියට\s*දෙන|බද්දට|දැන්වීම|வாடகைக்கு\s*விட|வாடகைக்கு\s*உள்ளது|விளம்பரம்/i;

/** "Anything in Kottawa?" — a question mark on a short message is an ask. */
function looksLikeAQuestion(text: string): boolean {
  return text.trim().endsWith('?') && text.length <= 160;
}

export function hasOfferingLanguage(text: string): boolean {
  return OFFERING_RE.test(text);
}

export function hasBudgetComparator(text: string): boolean {
  return BUDGET_COMPARATOR_RE.test(text);
}

export function hasSeekingLanguage(text: string): boolean {
  return SEEKING_RE.test(text);
}

/**
 * Decide what the sender is doing.
 *
 * The order of the checks IS the policy, so it is written out rather than
 * collapsed into a score:
 *
 *  1. An open intake — they are mid-listing, nothing else matters.
 *  2. Photos — nobody searches for a rental by sending pictures of one.
 *  3. Seeking or budget language — the specific, deliberate signals.
 *  4. An address or a phone number in the body — landlords print both.
 *  5. Offering language — "list my house" is a landlord with nothing filled in.
 *  6. Anything left → ask. A message that says neither is not evidence of either.
 *
 * Note 3 sits ABOVE 4 on purpose: tenants do leave their number ("looking for a
 * 2BR under 70k, call me on 077…"), and treating that as an advert is precisely
 * the bug. Photos still outrank it, because a message carrying property photos
 * is an advert whatever else it says.
 */
export function classifyIntent(
  msg: Pick<NormalizedInboundMessage, 'text' | 'mediaIds'>,
  parsed: ParsedIntake,
  ctx: IntentContext
): MessageIntent {
  if (ctx.hasOpenIntake) return 'listing';
  if (msg.mediaIds.length > 0) return 'listing';

  const text = msg.text ?? '';
  if (!text.trim()) return 'listing';

  if (hasSeekingLanguage(text) || hasBudgetComparator(text) || looksLikeAQuestion(text)) {
    return 'search';
  }

  if (parsed.address) return 'listing';
  if (extractPhoneNumbers(text).length > 0) return 'listing';

  // "I want to list my house" — no detail yet, but no ambiguity either.
  if (hasOfferingLanguage(text)) return 'listing';

  /*
   * Everything else asks.
   *
   * This used to fall back to 'listing' for a message with no listing detail,
   * which meant a bare "Hi" was answered with the fill-in-this-form template —
   * fine for the landlord it assumed, useless for the renter it did not. A
   * contentless message says nothing about which of the two it is, and on
   * WhatsApp there is always someone to ask.
   *
   * hasListingDetail no longer gates this: it separated "town + bedrooms + a
   * number" from "nothing at all", and both of those are now questions.
   */
  return 'ambiguous';
}
