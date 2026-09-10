/**
 * Recovering the location detail a Facebook advert states and the parser drops.
 *
 * THE ADVERT THAT PROMPTED THIS said, on its own line:
 *
 *     🟩 Colombo - Kirulapone, Polhengoda.
 *
 * and imported as city "Colombo", district "Colombo", address null. Kirulapone
 * and Polhengoda are the two most searchable words in the whole post — an annex
 * in "Colombo" is barely located at all in a city of 600,000 — and they
 * survived only inside the prose description.
 *
 * WHY THE PARSER CANNOT DO THIS. Both of its address paths require a house
 * number: `ADDRESS_RE` needs a digit token plus a street type (road, mawatha,
 * පාර …), and `ADDRESS_FALLBACK_RE` needs `\d{1,4},` before the place names.
 * That is correct for a WhatsApp intake, where the sender is describing their
 * own property and can be asked again. A Sri Lankan Facebook advert gives
 * landmarks and suburb names with no number anywhere.
 *
 * WHY IT IS FIXED HERE AND NOT THERE. `rule-parser.ts` is shared with the live
 * intake pipeline, so loosening its address rules changes what every intake
 * extracts and needs a RULES_VERSION bump plus a `pnpm parser:probe` re-run.
 * This is the importer making its own choice about its own text, like
 * `importDescription` before it.
 *
 * WHAT THIS IS ALLOWED TO BE. A prefill on a screen an operator confirms before
 * anything publishes — `parsed.address` feeds the Address field, which the
 * operator can see, edit or empty. That is the right confidence level for a
 * heuristic reading somebody else's prose, and the reason it can be looser than
 * the parser is allowed to be. It never runs when the parser already found an
 * address.
 */

import { isCityName, matchCity, type District } from '@/lib/intake/parser/gazetteer';
import type { ParsedIntake } from '@/lib/intake/parser/types';
import { tidyAdvertBullets } from './advert-text';

export interface LocationDetail {
  /** Unrecognised place segments, in the order the advert wrote them. */
  address: string;
  /**
   * Only set when the advert's own line names a town the gazetteer knows and
   * the parse did not. City and district ALWAYS move together — a town implies
   * its district, and half a location is worse than none.
   */
  city?: string;
  district?: District;
}

/**
 * Read one location line out of an advert.
 *
 * Requires BOTH a segment the gazetteer recognises and at least one it does
 * not. The known segment is what proves the line is a location at all; without
 * it, "Close to Main Roads." and "For more info, 071 769 3657" are just lines
 * with commas in them.
 */
export function locationDetail(
  text: string,
  current: { city: string | null; district: string | null }
): LocationDetail | null {
  const currentKnown = current.city
    ? isCityName(current.city.toLowerCase()) ?? matchCity(current.city.toLowerCase())
    : null;

  for (const line of text.split('\n')) {
    // tidyAdvertBullets already knows which characters are decoration; reusing
    // it means the marker list lives in exactly one place.
    const cleaned = tidyAdvertBullets(line).replace(/^•\s*/, '').trim();
    if (!cleaned) continue;

    /*
     * A PIPE MEANS THIS IS A TITLE, NOT AN ADDRESS. Facebook's og:title for a
     * group post is "<group name> | <post's first line>", and this function
     * happily read a town out of the right-hand side and published the group's
     * own name — "House, ඉක්මනින් හොයාගන්න" — as the property's address.
     *
     * composeOgText now keeps that string out of the advert text entirely, so
     * this is the second line of defence, for the rows stored before it and for
     * whatever else arrives pipe-separated. Nobody writes an address with a
     * pipe in it.
     */
    if (cleaned.includes('|')) continue;

    const segments = cleaned
      .split(/[,]|\s[-–—]\s|[-–—]/u)
      .map((segment) => segment.replace(/^[\s.:;]+|[\s.:;]+$/gu, ''))
      .filter(Boolean);
    if (segments.length < 2) continue;

    let known: { city: string; district: District } | null = null;
    const unknown: string[] = [];

    for (const segment of segments) {
      const hit = isCityName(segment.toLowerCase()) ?? matchCity(segment.toLowerCase());
      if (hit) {
        known ??= hit;
        continue;
      }
      if (isPlausiblePlace(segment)) unknown.push(segment);
    }

    if (!known || !unknown.length) continue;

    return {
      address: unknown.join(', '),
      // Replace a town only when ours is not in the gazetteer at all: a known
      // town on the advert's own location line beats a guess made from prose
      // elsewhere in the post. When our city IS known we leave it, because the
      // parser had the whole message to choose from and this has one line.
      ...(currentKnown ? {} : { city: known.city, district: known.district }),
    };
  }

  return null;
}

/** Apply the detail to a parse, if the parser did not already find an address. */
export function withLocationDetail(parsed: ParsedIntake, text: string): ParsedIntake {
  if (parsed.address) return parsed;

  const detail = locationDetail(text, { city: parsed.city, district: parsed.district });
  if (!detail) return parsed;

  return {
    ...parsed,
    address: detail.address,
    // Spread as a pair or not at all.
    ...(detail.city ? { city: detail.city, district: detail.district ?? parsed.district } : {}),
  };
}

/**
 * Does this segment look like the name of a place?
 *
 * Deliberately its own list rather than a shared one. `SEGMENT_STOP_WORD_RE` in
 * rule-parser.ts answers a related question for a different input (a segment
 * already known to follow a street number) and is not exported; importing it
 * would couple this heuristic to a file that must not change casually.
 */
function isPlausiblePlace(segment: string): boolean {
  if (segment.length < 3 || segment.length > 40) return false;
  // Three digits in a row is a rent, a postcode or a phone number, never a
  // suburb. A Colombo ward ("Colombo 5") resolves through the gazetteer above
  // and never reaches here.
  if (/\d{3,}/u.test(segment)) return false;

  const words = segment.split(/\s+/u);
  if (words.length > 4) return false;

  // Letters, and the punctuation that appears inside real Sri Lankan place
  // names ("St. Joseph's", "Kotte-Rajagiriya"). \p{M} for Sinhala vowel signs,
  // which are combining marks rather than letters.
  if (!/^[\p{L}\p{M}][\p{L}\p{M}\d\s'./-]*$/u.test(segment)) return false;

  // Capitalised, or in a script that has no capitals. Sri Lankan adverts
  // capitalise place names; prose fragments are the thing being excluded.
  if (!/^[\p{Lu}\p{Lo}]/u.test(segment)) return false;

  return !FEATURE_VOCABULARY_RE.test(segment);
}

/**
 * Advert vocabulary that is never a place, in the three scripts the marketplace
 * serves. A line can hold both a town and a feature list, so this filters the
 * segments rather than the line.
 */
const FEATURE_VOCABULARY_RE =
  // `house|villa|apartment|flat|annexe?` are here because a Facebook GROUP is
  // routinely named after what it lists — "House, Annex & Rooms For Rent" — and
  // its name reached this function as an advert line. They are property types,
  // never place names, so excluding them costs nothing either way.
  /\b(?:house|villa|apartment|flat|annexe?|kitchen|hall|bathrooms?|bedrooms?|beds?|baths?|rooms?|living|dining|pantry|garage|parking|vehicle|cctv|security|water|electricity|entrance|furnished|unfurnished|spacious|available|rent|rental|monthly|advance|deposit|negotiable|contact|info|call|whatsapp|month|perch(?:es)?|sq\.?\s*ft|floor|storey|upstairs|downstairs|preferred|only|please|near|close|main\s+roads?)\b|කාමර|කුලිය|නිවස|ගෙදර|මාසික|අමතන්න|හොයාගන්න|அறை|வாடகை|வீடு|மாதம்|தொடர்பு/iu;
