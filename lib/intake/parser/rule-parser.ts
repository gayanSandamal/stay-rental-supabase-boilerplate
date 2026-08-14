/**
 * Deterministic rule-based extraction of listing fields from free-text intake
 * messages (English / romanized Sinhala / Sinhala and Tamil script). Primary
 * parser for the intake pipeline — pure, synchronous, never returns null, and
 * safe to unit-test with no environment. The flag-gated LLM fallback only
 * fills fields these rules leave null (see ./index.ts).
 */

import { ParsedIntake, computeMissingFields } from './types';
import { matchCity, matchAllCities, matchDistrict, isCityName, fuzzyCityName } from './gazetteer';
import { scoreSuspicion } from './scam';

export const RULES_VERSION = 5;

/** Sanity clamp at extraction time; checks.ts enforces the market window. */
const RENT_FLOOR = 1_000;
const RENT_CEIL = 10_000_000;

const PHONE_RES = [
  /(?:\+?94[\s-]?|0)7\d(?:[\s-]?\d){7}/g, // SL mobiles: 07XXXXXXXX / +947XXXXXXXX
  /0\d{2}[\s-]?\d{7}/g, // SL landlines: 0112345678 / 011-2345678
  /\+\d{10,13}/g, // generic international
];

/** Deposit/advance amounts must never be read as rent. */
const DEPOSIT_BEFORE_RE = /(?:deposit|advance|key\s*money)\s*(?:[:\-]|of|is)?\s*(?:lkr|rs\.?|rupees)?\s*$/i;
const DEPOSIT_AFTER_RE = /^\s*(?:\/[-=])?\s*(?:as\s+|for\s+)?(?:deposit|advance|key\s*money)/i;

/** Utility/service amounts ("electricity 5k per month") must never be read as rent. */
const UTILITY_BEFORE_RE =
  /(?:electricity|current|water|service\s*charge|maintenance|internet|wifi|broadband|cable|garbage|parking|bills?)\b[^\d]{0,20}$/i;
const UTILITY_AFTER_RE =
  /^\s*(?:\/[-=])?\s*(?:for\s+)?(?:electricity|water|service\s*charge|maintenance|internet|wifi|parking)/i;

/** Daily/weekly short-stay rates are not monthly rent — leave rent unset instead. */
const NON_MONTHLY_NEAR_RE =
  /(?:\b(?:per|a|each)\s*(?:day|night|week)\b|\/\s*(?:day|night|week)\b|\b(?:daily|nightly|weekly)\b)/i;

/** "April 2026" / "from 2026": availability dates, not amounts. */
const MONTH_OR_FROM_BEFORE_RE =
  /(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec|from|until|till)\.?\s*$/i;

/** USD/dollar amounts must never publish at LKR face value. */
const USD_BEFORE_RE = /(?:usd|us\s*\$|\$|dollars?)\s*$/i;
const USD_AFTER_RE = /^\s*(?:usd|dollars?)\b/i;

function normalize(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[*_~]+/g, ' ') // WhatsApp bold/italic/strike markers
    .replace(/\s+/g, ' ')
    .trim();
}

function maskPhones(text: string): string {
  let out = text;
  for (const re of PHONE_RES) {
    out = out.replace(re, ' ⌀ ');
  }
  return out;
}

function isDepositContext(text: string, start: number, end: number): boolean {
  return (
    DEPOSIT_BEFORE_RE.test(text.slice(Math.max(0, start - 30), start)) ||
    DEPOSIT_AFTER_RE.test(text.slice(end, end + 30))
  );
}

/**
 * True when the amount at [start,end) is not this listing's monthly rent.
 * `numStart` is where the digits themselves begin — keyword passes match from
 * the keyword ("rent from april 2026"), so currency/date context must be
 * checked against the number, not the match.
 */
function isExcludedRentContext(
  text: string,
  start: number,
  end: number,
  value: number,
  numStart: number
): boolean {
  const before = text.slice(Math.max(0, start - 30), start);
  const beforeNum = text.slice(Math.max(0, numStart - 25), numStart);
  // Rate qualifiers sit tight against the amount ("daily rent 7,000", "7000/day").
  const around = text.slice(Math.max(0, start - 18), Math.min(text.length, end + 12));
  if (UTILITY_BEFORE_RE.test(before) || UTILITY_AFTER_RE.test(text.slice(end, end + 30))) {
    return true;
  }
  if (NON_MONTHLY_NEAR_RE.test(around)) return true;
  if (USD_BEFORE_RE.test(beforeNum) || USD_AFTER_RE.test(text.slice(end, end + 15))) return true;
  // A year-like bare number right after a month name / "from" is a date.
  if (value >= 1900 && value <= 2100 && MONTH_OR_FROM_BEFORE_RE.test(beforeNum)) return true;
  return false;
}

function toAmount(numText: string, thousands: boolean): number {
  const n = Number(numText.replace(/,/g, ''));
  return thousands ? n * 1_000 : n;
}

/** First non-deposit match of `re` in `text`, mapped to an LKR amount. */
function firstRentMatch(
  text: string,
  re: RegExp,
  amount: (m: RegExpMatchArray) => number
): number | null {
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (isDepositContext(text, start, end)) continue;
    const value = amount(m);
    if (!Number.isFinite(value) || value < RENT_FLOOR || value > RENT_CEIL) continue;
    const numStart = start + Math.max(0, m[0].lastIndexOf(m[1]));
    if (isExcludedRentContext(text, start, end, value, numStart)) continue;
    return Math.round(value);
  }
  return null;
}

// Ordered specific → loose; the first pass that yields a plausible amount wins.
// The explicit rent-keyword pass outranks the generic "X per month" pass so
// "Electricity 5k per month extra. Rent 50k" reads 50k, not 5k.
const RENT_PASSES: Array<{ re: RegExp; amount: (m: RegExpMatchArray) => number }> = [
  // "1.2 lakh", "2 lakhs"
  { re: /(\d+(?:\.\d+)?)\s*(?:lakhs?|lacs?|laks)\b/g, amount: (m) => Number(m[1]) * 100_000 },
  // "Rs. 85,000", "LKR 85000", "rs 85k", "ரூ. 85,000"
  {
    re: /(?:\b(?:lkr|rs\.?|rupees|slr)|ரூ(?:பாய்|பா)?\.?)\s*:?\s*([\d,]+(?:\.\d+)?)\s*(k\b)?/gu,
    amount: (m) => toAmount(m[1], Boolean(m[2])),
  },
  // "monthly rent 85,000", "rent is 85000", "rent 50k", "kuliya 45,000",
  // "வாடகை 45,000". Skip words admit \p{M}: Sinhala/Tamil vowel signs are
  // combining marks, so "வாடகை மாதம் 45000" never bridges on \p{L} alone.
  {
    re: /(?:\b(?:rental|rent|monthly)|kuliya|කුලිය|வாடகை)(?:\s+[\p{L}\p{M}]+){0,2}?\s*(?:[:\-]|is|of)?\s*([\d,]{2,}(?:\.\d+)?)\s*(k\b)?/gu,
    amount: (m) => toAmount(m[1], Boolean(m[2])),
  },
  // "85,000/month", "85000 per month", "85k pm", "35,000 மாதம்"
  {
    re: /([\d,]+(?:\.\d+)?)\s*(k\b)?\s*(?:\/|per\s*)?(?:monthly|month\b|mnth\b|mo\b|pm\b|மாதம்|மாதத்திற்கு)/gu,
    amount: (m) => toAmount(m[1], Boolean(m[2])),
  },
  // "85,000/-", "85000/=" (common SL classified style)
  { re: /([\d,]{4,})\s*\/[-=]/g, amount: (m) => toAmount(m[1], false) },
  // bare "85k"
  { re: /(\d+(?:\.\d+)?)\s*k\b/g, amount: (m) => toAmount(m[1], true) },
  // bare amount near a rent keyword: "80000 rent"
  {
    re: /([\d,]{4,})[^\d]{0,30}(?:\b(?:rental|rent|monthly)|kuliya|කුලිය|வாடகை)/gu,
    amount: (m) => toAmount(m[1], false),
  },
];

/** The bare-number fallback only fires for a message that is clearly a rental. */
const RENT_CONTEXT_RE =
  /\b(?:rent|rental|renting|monthly|lease|price)\b|kuliya|කුලිය|வாடகை|\blkr\b|\brs\b|rupees/iu;

/** A unit glued after a number proves it is size/distance/count, not rent. */
const NON_RENT_UNIT_AFTER_RE =
  /^\s*(?:sq\.?\s?(?:ft|feet|foot|m|meters?|metres?)|sqft|sqm|perch(?:es)?|acres?|cents?|kms?\b|cm\b|mm\b|meters?\b|metres?\b|m\b|min(?:ute)?s?\b|%|kg\b|kw\b|bhk\b|br\b|beds?\b|baths?\b|floors?\b|stor(?:eys?|ies|y)\b|years?\b|yrs?\b|ft\b|feet\b)/iu;

/**
 * Rents written bare are always well above the market floor, so a low floor
 * here would let years ("built 2000") and ids slip through as rent.
 */
const BARE_RENT_FLOOR = 5_000;

/**
 * Last-resort rent: a bare, round number with no currency, keyword or suffix —
 * the extremely common "…\n47000" sign-off that every RENT_PASSES pattern
 * misses. Guarded hard because bare numbers are dangerous: needs a rental
 * context in the message, a 4–7 digit (or comma-grouped) value that is a
 * multiple of 100 (rents are round; house numbers and ids are not), not glued
 * to a size/distance unit, and not a deposit/date/USD amount. The rent is the
 * largest such figure in a listing.
 */
function extractBareRent(lower: string): number | null {
  if (!RENT_CONTEXT_RE.test(lower)) return null;
  const re = /(?<![\d.,])(\d{1,3}(?:,\d{3})+|\d{4,7})(?![\d.,])/g;
  let best: number | null = null;
  for (const m of lower.matchAll(re)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const value = Number(m[1].replace(/,/g, ''));
    if (!Number.isFinite(value) || value < BARE_RENT_FLOOR || value > RENT_CEIL) continue;
    if (value % 100 !== 0) continue;
    if (isDepositContext(lower, start, end)) continue;
    if (isExcludedRentContext(lower, start, end, value, start)) continue;
    if (NON_RENT_UNIT_AFTER_RE.test(lower.slice(end, end + 12))) continue;
    if (best == null || value > best) best = value;
  }
  return best;
}

function extractRent(lower: string): number | null {
  for (const pass of RENT_PASSES) {
    pass.re.lastIndex = 0;
    const value = firstRentMatch(lower, pass.re, pass.amount);
    if (value != null) return value;
  }
  return extractBareRent(lower);
}

/**
 * Distinct plausible rent amounts across all passes — ≥2 alongside ≥2 cities
 * signals a multi-property message.
 */
function countRentCandidates(lower: string): number {
  const values = new Set<number>();
  for (const pass of RENT_PASSES) {
    pass.re.lastIndex = 0;
    for (const m of lower.matchAll(pass.re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (isDepositContext(lower, start, end)) continue;
      const value = pass.amount(m);
      if (!Number.isFinite(value) || value < RENT_FLOOR || value > RENT_CEIL) continue;
      const numStart = start + Math.max(0, m[0].lastIndexOf(m[1]));
      if (isExcludedRentContext(lower, start, end, value, numStart)) continue;
      values.add(Math.round(value));
    }
  }
  return values.size;
}

const MULTI_PROPERTY_PHRASE_RE =
  /\b(?:two|three|four|2|3|4)\s+(?:houses|homes|properties|apartments|flats|annexe?s|units)\b|\banother\s+(?:house|home|property|apartment|flat|annexe?|unit|one)?\s*in\b/iu;

function extractCount(lower: string, res: RegExp[]): number | null {
  for (const re of res) {
    for (const m of lower.matchAll(re)) {
      const n = Number(m[1] ?? m[2]);
      if (Number.isFinite(n) && n >= 1 && n <= 20) return n;
    }
  }
  return null;
}

function extractBedrooms(lower: string): number | null {
  return extractCount(lower, [
    /(\d+)[\s-]*(?:br|bhk|bed\s?rooms?|beds?)\b/g,
    /(?:bed\s?rooms?|beds?)\s*[:\-]?\s*(\d+)/g,
    /(?:kamara|කාමර)\s*(\d+)/gu,
    /(\d+)\s*(?:kamara|කාමර)/gu,
    // Bare அறை ("room") is a common bedroom count, but only as its own word
    // and never right after குளியல் — "குளியல் அறை 2" counts bathrooms.
    /(?:படுக்கையறை(?:கள்)?|(?<![\p{L}\p{M}])(?<!குளியல்\s{0,3})அறை(?:கள்)?)\s*[:\-]?\s*(\d+)/gu,
    /(\d+)\s*(?:படுக்கையறை|அறை)/gu,
  ]);
}

function extractBathrooms(lower: string): number | null {
  const counted = extractCount(lower, [
    /(\d+)[\s-]*(?:bath\s?rooms?|baths?|washrooms?|toilets?)\b/g,
    /(?:bath\s?rooms?|baths?|washrooms?|toilets?)\s*[:\-]?\s*(\d+)/g,
    /(\d+)\s*(?:குளியலறை|குளியல்\s?அறை)/gu,
    /(?:குளியலறை|குளியல்\s?அறை)(?:கள்)?\s*[:\-]?\s*(\d+)/gu,
  ]);
  if (counted != null) return counted;
  return /attached\s+bath(?:\s?room)?/.test(lower) ? 1 : null;
}

function extractPropertyType(lower: string): {
  propertyType: ParsedIntake['propertyType'];
  annex: boolean;
} {
  // "annex" keeps the 3-value type union: stored as house, surfaced in title.
  if (/\bannexe?s?\b/.test(lower)) return { propertyType: 'house', annex: true };
  if (
    /\b(?:apartments?|flats?|condos?|penthouses?)\b/.test(lower) ||
    /මහල්|அடுக்குமாடி|அபார்ட்மெண்ட்/u.test(lower)
  ) {
    return { propertyType: 'apartment', annex: false };
  }
  // "room" only in a renting context — "2 bedrooms" must never classify as
  // room, and "house with 2 rooms for rent" describes the house's capacity,
  // not a room rental (hence the lookbehind).
  if (
    /\b(?:single|sharing|boarding)\s+rooms?\b|(?<!\bwith\s{1,3}\d{0,2}\s{0,3})\brooms?\s+(?:for|to)\s+(?:rent|let)\b|\bboarding\b/.test(
      lower
    )
  ) {
    return { propertyType: 'room', annex: false };
  }
  if (
    /\b(?:house|home|bungalow|villa|gedara|gedhara)\b/.test(lower) ||
    /නිවස|ගෙදර|வீடு|வீட்டு/u.test(lower)
  ) {
    return { propertyType: 'house', annex: false };
  }
  return { propertyType: null, annex: false };
}

const ADDRESS_RE =
  // \p{M} alongside \p{L}: Sinhala vowel signs (ා ි ෙ …) are combining marks,
  // not letters — without it no Sinhala street name can ever match.
  // The number token must be separated from what follows by a comma or space —
  // otherwise ordinals self-match ("1st" = "1" + the bare "st" suffix).
  /(?:no\.?\s*)?\d+[\p{L}\p{M}\d/-]*(?:\s*,\s*|\s+)(?:[\p{L}][\p{L}\p{M}\d'.]*\s+){0,4}(?:road|rd|lane|ln|mawatha|mw|place|pl|avenue|ave|street|st|drive|crescent|close|gardens?|terrace|watt[ae]|para|pedesa|patumaga|පාර|මාවත|පෙදෙස|පටුමග|வீதி|தெரு|சாலை|ஒழுங்கை)\.?(?=[\s,.]|$)/iu;

interface AddressResult {
  address: string;
  /**
   * City resolved from the comma segment right after the street ("…Temple
   * Road, Kohuwala"). Address-adjacent beats a city name mentioned anywhere
   * else in the message ("I live in Colombo, house at 10 Temple Road, Ella").
   */
  cityOverride: { city: string; district: string } | null;
}

function extractAddress(maskedOriginalCase: string, city: string | null): AddressResult | null {
  const m = maskedOriginalCase.match(ADDRESS_RE);
  if (!m) return extractAddressFallback(maskedOriginalCase, city);
  let address = m[0].replace(/[.,\s]+$/, '');
  let cityOverride: AddressResult['cityOverride'] = null;

  // The following comma segment is either the area/city (resolve through the
  // gazetteer — any alias/script) or an unknown area kept as address detail.
  // The segment may end at a comma/full-stop, the string end, OR a run of 3+
  // digits — after normalize() folds the newlines, a bare rent glued on
  // ("…, Gampaha 47000") must not stop the city from resolving. A 1–2 digit
  // Colombo ward ("…, Colombo 5") is deliberately NOT a terminator.
  const rest = maskedOriginalCase.slice((m.index ?? 0) + m[0].length);
  const segment = rest.match(/^\s*,\s*([\p{L}][\p{L}\p{M}\s'.-]{1,40}?)(?=\s*(?:[,.]|\d{3,}|$))/u);
  if (segment) {
    const seg = segment[1].trim();
    const segMatch = matchCity(seg.toLowerCase());
    if (segMatch && segMatch.city !== city) {
      cityOverride = segMatch;
    }
    if (!segMatch && (!city || seg.toLowerCase() !== city.toLowerCase())) {
      address += `, ${seg}`;
    }
  }
  return { address, cityOverride };
}

/**
 * Fallback for the extremely common Sri Lankan address with NO street type:
 * "220/A, Mackwatte, Asgiriya" — house number, then comma-separated place
 * names. Requires the comma and capitalized (or Sinhala) segments so prices
 * ("rent 4,500, negotiable") and chat filler ("after 7, thanks") never match.
 */
const ADDRESS_FALLBACK_RE =
  // NB: no `i` flag — case-insensitivity would let \p{Lu} match lowercase and
  // destroy the capitalization guard; the No-prefix is spelled out instead.
  /(?<![\d,])((?:[Nn][Oo]\.?\s*)?\d{1,4}[\p{L}\p{M}\d/-]*)\s*,\s*([\p{Lu}\p{Lo}][\p{L}\p{M}\d'-]*(?:\s+[\p{Lu}\p{Lo}\d][\p{L}\p{M}\d'-]*){0,3}(?:\s*,\s*[\p{Lu}\p{Lo}][\p{L}\p{M}\d'\s-]{0,30}){0,2})/u;

// No '.' in the trailing filler: "for rent. 220/A, …" is a sentence boundary
// before an address, not a rent amount ("rent: 4500," still guarded).
const MONEY_CONTEXT_BEFORE_RE =
  /(?:rent|rental|monthly|kuliya|කුලිය|வாடகை|மாதம்|rs\.?|lkr|slr|ரூ\.?|rupees|deposit|advance|key\s*money|area|size|extent|sq\.?\s*ft|sqft|perch(?:es)?)[\s:\-]*$/i;

// Words that never START an address segment: room/feature/unit vocabulary in
// any script. Critical for Sinhala and Tamil, which have no capitalization
// for the caps guard to lean on.
const SEGMENT_STOP_WORD_RE =
  /^(?:kitchen|hall|bathrooms?|bedrooms?|beds?|baths?|rooms?|living|dining|pantry|garage|parking|rent|rental|monthly|available|modern|spacious|fully|furnished|sqft|perch(?:es)?|acres?|කාමර|කුලිය|නිවස|ගෙදර|මහල්|මාසික|அறை(?:கள்)?|படுக்கையறை(?:கள்)?|குளியலறை(?:கள்)?|வாடகை|வீடு|மாதம்)$/iu;

function extractAddressFallback(
  maskedOriginalCase: string,
  city: string | null
): AddressResult | null {
  const m = maskedOriginalCase.match(ADDRESS_FALLBACK_RE);
  if (!m) return null;
  const start = m.index ?? 0;
  const lower = maskedOriginalCase.toLowerCase();
  const numberPart = m[1].trim();
  const digits = numberPart.replace(/^no\.?\s*/i, '');

  // Amounts and years must never become house numbers.
  if (/^\d+(?:\.\d+)?k$/i.test(digits)) return null;
  if (/^\d+$/.test(digits) && (digits.length >= 5 || /^(19|20)\d{2}$/.test(digits))) return null;
  // A lone bare digit ("after 7, thanks") is only plausible with a "No" prefix.
  if (/^\d$/.test(digits) && digits === numberPart) return null;
  const numStart = start + m[0].indexOf(digits);
  if (MONEY_CONTEXT_BEFORE_RE.test(lower.slice(Math.max(0, numStart - 14), numStart))) {
    return null;
  }

  let cityOverride: AddressResult['cityOverride'] = null;
  const segments: string[] = [];
  for (const rawSeg of m[2].split(',')) {
    // Keep only the leading run of capitalized/Sinhala/numeric words —
    // trailing prose ("Kandana Watta for rent") is not part of the address.
    // Stop-words and long numbers end the run in BOTH scripts (Sinhala has no
    // capitalization, so "මහරගම කාමර 3 කුලිය 45000" must stop at කාමර).
    const words: string[] = [];
    for (const w of rawSeg.trim().split(/\s+/)) {
      if (!/^[\p{Lu}\p{Lo}\d]/u.test(w)) break;
      if (SEGMENT_STOP_WORD_RE.test(w)) break;
      if (/^\d{4,}$/.test(w)) break;
      words.push(w);
    }
    let seg = words.join(' ');
    if (!seg) continue;
    // Segment ENDING in the city name ("Asgiriya Gampaha") keeps its local part.
    if (city && seg.toLowerCase().endsWith(city.toLowerCase())) {
      seg = seg.slice(0, seg.length - city.length).trim();
      if (!seg) continue;
    }
    // Segment that IS exactly a known city ("…, Kelaniya"): the city, not
    // address detail. Exact match only — "Kandana Estate" contains a city
    // name but is a place in its own right.
    const segMatch = isCityName(seg.toLowerCase());
    if (segMatch) {
      if (segMatch.city !== city) cityOverride = segMatch;
      continue;
    }
    segments.push(seg);
    if (segments.length === 3) break;
  }

  // Without at least one real place segment ("12, Colombo") this is not an address.
  if (segments.length === 0) return null;
  return { address: [numberPart, ...segments].join(', '), cityOverride };
}

function composeTitle(args: {
  bedrooms: number | null;
  propertyType: ParsedIntake['propertyType'];
  annex: boolean;
  city: string | null;
}): string | null {
  // A known type still titles without a city ("5BR House") — otherwise one
  // gazetteer miss surfaces as TWO missing fields and the sender is asked
  // for a property type they already gave.
  if (!args.city && !args.propertyType) return null;
  const typeLabel = args.annex
    ? 'Annex'
    : args.propertyType
      ? args.propertyType.charAt(0).toUpperCase() + args.propertyType.slice(1)
      : 'Property';
  return [args.bedrooms ? `${args.bedrooms}BR` : null, typeLabel, args.city ? `in ${args.city}` : null]
    .filter(Boolean)
    .join(' ');
}

function composeDescription(original: string): string | null {
  if (!original) return null;
  if (original.length <= 400) return original;
  const cut = original.slice(0, 400);
  const lastSentence = Math.max(
    cut.lastIndexOf('. '),
    cut.lastIndexOf('! '),
    cut.lastIndexOf('? ')
  );
  return lastSentence > 200 ? cut.slice(0, lastSentence + 1) : cut.trimEnd() + '…';
}

/**
 * Edit verbs that signal "change my existing listing" rather than a new
 * submission. "fix" is deliberately absent — landlords write "we fix minor
 * issues" in fresh ads.
 */
const UPDATE_INTENT_RE =
  /\b(?:update|change|edit|modify|correct|remove|delete|replace|add)\b|වෙනස්|මකන්න|අයින්|යාවත්කාලීන/iu;

/**
 * True when a message reads as an update to an existing listing: it contains
 * an edit verb AND does not carry a street address (the strongest new-listing
 * signal — update requests rarely restate the address, fresh ads almost
 * always do). The caller still requires the sender to have a published
 * listing to target.
 */
export function detectUpdateIntent(messageText: string): boolean {
  const text = messageText ?? '';
  if (!UPDATE_INTENT_RE.test(text)) return false;
  return parseIntakeRules(text).address == null;
}

/**
 * Words worth testing as a misspelt town. Deliberately narrow: only tokens that
 * could be a place name at all, taken from the whole message because landlords
 * write the town anywhere ("house for rent Pannupitiya", "at Pannupitiya, 2br").
 *
 * Nothing here is applied on its own — `parseIntakeRules` records a suggestion
 * and leaves `city` null, so a bad guess costs a confirmation prompt rather
 * than a listing filed under the wrong town.
 */
function cityCandidateTokens(original: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of original.split(/[^\p{L}\p{M}]+/u)) {
    const token = raw.trim();
    // Numbers and short words are excluded by fuzzyCityName's own guards, but
    // skipping them here keeps the loop off ~90% of a typical message.
    if (token.length < 6) continue;
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(token);
  }
  return out;
}

function suggestCity(original: string): ParsedIntake['citySuggestion'] {
  for (const token of cityCandidateTokens(original)) {
    const hit = fuzzyCityName(token);
    // A token that already IS a known town would have been caught by matchCity;
    // reaching here with distance 0 means it was rejected as a road name, so
    // suggesting it would relitigate that decision.
    if (!hit || hit.distance === 0) continue;
    return { city: hit.city, district: hit.district, from: token, confident: hit.confident };
  }
  return undefined;
}

export function parseIntakeRules(messageText: string): ParsedIntake {
  const original = normalize(messageText ?? '');
  const masked = maskPhones(original);
  const lower = masked.toLowerCase();

  const rentPerMonth = extractRent(lower);
  const bedrooms = extractBedrooms(lower);
  const bathrooms = extractBathrooms(lower);
  const { propertyType, annex } = extractPropertyType(lower);
  const cityMatch = matchCity(lower);
  let city = cityMatch?.city ?? null;
  let district: string | null = cityMatch?.district ?? matchDistrict(lower);
  // Only worth looking for a misspelling when no town matched outright.
  const citySuggestion = city ? undefined : suggestCity(original);
  if (citySuggestion?.confident) {
    // A single edit on a long word with a matching prefix is a typo, not a
    // different place — correcting it silently saves a needless round trip.
    city = citySuggestion.city;
    district = citySuggestion.district;
  }
  const addressResult = extractAddress(masked, city);
  if (addressResult?.cityOverride) {
    city = addressResult.cityOverride.city;
    district = addressResult.cityOverride.district;
  }
  const address = addressResult?.address ?? null;
  const multiProperty =
    MULTI_PROPERTY_PHRASE_RE.test(lower) ||
    (matchAllCities(lower).length >= 2 && countRentCandidates(lower) >= 2);
  const title = composeTitle({ bedrooms, propertyType, annex, city });
  const description = composeDescription(original);
  const suspicion = scoreSuspicion(original, { rentPerMonth, bedrooms, city, address });

  const parsed: ParsedIntake = {
    title,
    propertyType,
    address,
    city,
    district,
    bedrooms,
    bathrooms,
    rentPerMonth,
    description,
    missingFields: [],
    suspicious: suspicion.suspicious,
    suspicionReason: suspicion.reason,
    multiProperty,
    // Kept even once applied: the back office can see what was corrected, and
    // an unapplied one is what the confirmation prompt is built from.
    citySuggestion,
    parserMeta: { engine: 'rules', rulesVersion: RULES_VERSION },
  };
  parsed.missingFields = computeMissingFields(parsed);
  return parsed;
}
