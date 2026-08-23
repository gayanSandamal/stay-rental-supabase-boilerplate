/**
 * Sticky listing facts across the turns of ONE intake.
 *
 * THE INCIDENT THIS EXISTS FOR (intake #31, 2026-08-23, Horana).
 * A landlord sent a complete Sinhala ad, then answered three follow-up
 * questions. Each turn appends to `whatsapp_intakes.message_text` and
 * `processIntake` re-parses the whole blob from scratch, keeping only the
 * result of that one run. So the field set was whatever the last parse
 * happened to produce, and the ask got BIGGER after the landlord answered:
 *
 *   12:20  → "we still need: the address and the town"
 *   12:24  landlord sends the address
 *   12:31  → "we still need: the PROPERTY TYPE, the address and the town"
 *
 * Replaying the stored text proves the rule parser is stable across those
 * turns — it is the LLM fallback that moved. It is asked only for the fields
 * the rules missed, so every turn sends it a different question, and its
 * answer for `title` legitimately differs run to run. Nondeterminism is fine
 * in an extractor; it is not fine when nothing remembers the previous answer.
 *
 * Hence: extraction may be nondeterministic, but the intake's knowledge only
 * ever grows. A field that was known at turn N is known at turn N+1. That
 * invariant is what makes the LLM safe to lean on, and no amount of prompt
 * work substitutes for it.
 */

import { ParsedIntake, computeMissingFields } from './parser/types';
import { isCityName, normalizeLocation } from './parser/gazetteer';
import { isCommandWord } from './command-words';

/**
 * Facts about the property that persist across turns.
 *
 * `city`/`district` are deliberately absent: they move as a PAIR and are
 * handled separately below. Carrying them independently is how a listing ends
 * up with one turn's town and another turn's district — which is exactly the
 * contradiction that held listing #24.
 */
const STICKY_FIELDS = [
  'title',
  'propertyType',
  'address',
  'bedrooms',
  'bathrooms',
  'rentPerMonth',
  'description',
] as const;

/** How many times we may ask before a human takes over. */
export const NEEDS_INFO_MAX_ROUNDS = 2;

/** Longest free-text answer we will accept as an address. */
const MAX_ADOPTED_ADDRESS = 120;

/**
 * Labels landlords put in front of an answer, in all three languages.
 * "ලිපිනය- හොරණ ප්‍රධාන මාර්ගයට යාබදව" is the address, not a line whose
 * first word is "address".
 */
const FIELD_LABEL_RE =
  /^\s*(?:address|location|addr|ලිපිනය|ලිපිනය\s*නම්|முகவரி|இடம்)\s*[-:–—]?\s*/iu;

/** Read back what a previous run stored, tolerating anything malformed. */
export function parseStoredPayload(json: string | null | undefined): ParsedIntake | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json);
    return value && typeof value === 'object' ? (value as ParsedIntake) : null;
  } catch {
    return null;
  }
}

/** Read back a stored JSON string array (`asked_fields`), tolerating junk. */
export function parseStoredFields(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? value.filter((f): f is string => typeof f === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Merge this turn's parse onto everything the intake already knew.
 *
 * Fresh non-null values WIN — a landlord who says "actually make it 30,000"
 * must be able to correct us. Previous values only fill what this turn left
 * null. The result is monotonic in knowledge, never in staleness.
 */
export function carryForward(
  previous: ParsedIntake | null,
  fresh: ParsedIntake
): ParsedIntake {
  if (!previous) return fresh;

  const merged: ParsedIntake = { ...fresh };

  // Each field is copied to itself, so the types line up; TypeScript cannot
  // see that through the union of key types, hence the single assertion.
  const target = merged as Record<(typeof STICKY_FIELDS)[number], unknown>;
  for (const field of STICKY_FIELDS) {
    if (merged[field] == null && previous[field] != null) {
      target[field] = previous[field];
    }
  }

  // Town and district move together or not at all.
  if (merged.city == null && previous.city != null) {
    merged.city = previous.city;
    merged.district = previous.district;
  } else if (merged.city != null && merged.district == null) {
    // This turn found a town but no district. Only inherit the previous
    // district if it belongs to THIS town; otherwise derive it.
    const location = normalizeLocation(merged.city, previous.district ?? undefined);
    merged.district = location.district;
  }

  // Safety flags only ever accumulate. A later, thinner turn ("ok thanks")
  // parses clean, and letting that clear a scam or multi-property flag raised
  // earlier would turn a follow-up message into a way to launder a submission.
  merged.suspicious = Boolean(fresh.suspicious || previous.suspicious);
  merged.multiProperty = Boolean(fresh.multiProperty || previous.multiProperty);
  merged.suspicionReason =
    [previous.suspicionReason, fresh.suspicionReason]
      .filter((r, i, all) => Boolean(r) && all.indexOf(r) === i)
      .join(' + ') || null;

  // Advisory town guesses are about THIS turn's text only. Carrying a stale
  // shortlist forward would re-offer a menu the landlord already answered.
  merged.citySuggestion = fresh.citySuggestion;
  merged.cityCandidates = fresh.cityCandidates;
  merged.cityTyped = fresh.cityTyped;
  // A town that has since resolved is not a town still in question.
  if (merged.city) {
    merged.cityCandidates = undefined;
    merged.cityTyped = undefined;
  }

  merged.missingFields = computeMissingFields(merged);
  return merged;
}

export interface AdoptionResult {
  parsed: ParsedIntake;
  /** Fields filled from the landlord's reply rather than from extraction. */
  adopted: string[];
}

/**
 * Take the landlord at their word.
 *
 * When we ask "what is the address?" and they answer, that reply IS the
 * address — their direct answer to a direct question is stronger evidence
 * than a regex. `ADDRESS_RE` wants a house number and a street type
 * ("42 Temple Road"); a Sri Lankan landlord will often give a landmark
 * instead ("adjoining the Horana main road"), and refusing it means asking
 * again forever, which is what happened on 2026-08-23.
 *
 * Address is the ONLY field adopted this way, on purpose. It is unverifiable
 * free text by nature, so accepting it costs nothing. `city` is a controlled
 * vocabulary with a confirmation menu, and the pipeline's standing rule is
 * that a wrong town is worse than a missing one — so a typed town still goes
 * through the gazetteer, never straight into the column.
 */
export function adoptAnswer(
  parsed: ParsedIntake,
  askedFields: string[],
  answerText: string | null | undefined
): AdoptionResult {
  const adopted: string[] = [];
  if (!answerText || !askedFields.includes('address') || parsed.address != null) {
    return { parsed, adopted };
  }

  const candidate = cleanAnswer(answerText);
  if (!candidate) return { parsed, adopted };

  // "Horana" answering an address+town ask is the town, which the parse has
  // already taken. Storing it as the address too is noise on the listing.
  //
  // isCityName, NOT matchCity/normalizeLocation: those scan free text for a
  // town anywhere inside it, and "near the Kaduwela junction" would match —
  // discarding the one kind of answer this function exists to accept. The
  // question here is whether the reply is NOTHING BUT a town name.
  if (parsed.city && candidate.toLowerCase() === parsed.city.toLowerCase()) {
    return { parsed, adopted };
  }
  if (isCityName(candidate.toLowerCase())) return { parsed, adopted };

  const next: ParsedIntake = { ...parsed, address: candidate };
  next.missingFields = computeMissingFields(next);
  adopted.push('address');
  return { parsed: next, adopted };
}

/**
 * The usable part of a reply: label stripped, one line, bounded.
 * Returns null for anything that is plainly not an address.
 */
function cleanAnswer(text: string): string | null {
  // Multi-line replies: the labelled line is the answer if there is one,
  // otherwise the first line with letters in it.
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const labelled = lines.find((l) => FIELD_LABEL_RE.test(l));
  const raw = labelled ?? lines.find((l) => /\p{L}/u.test(l));
  if (!raw) return null;

  const stripped = raw.replace(FIELD_LABEL_RE, '').replace(/[.,\s]+$/u, '').trim();
  if (!stripped) return null;
  // A bare number is a rent or a bedroom count answering some other ask.
  if (!/\p{L}/u.test(stripped)) return null;
  // Our own keywords are never data. Asked in the shared vocabulary rather than
  // a local list: a landlord replying "ඔව්" is acknowledging us, and storing it
  // would publish "ඔව්" as a real house's street address.
  if (isCommandWord(stripped)) return null;
  if (stripped.length > MAX_ADOPTED_ADDRESS) return null;
  return stripped;
}

/** Whatever the landlord has sent since our last question, oldest first. */
export function appendPendingAnswer(
  existing: string | null | undefined,
  incoming: string | null | undefined
): string | null {
  return [existing, incoming].filter(Boolean).join('\n') || null;
}
