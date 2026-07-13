/**
 * Deterministic rule-based extraction of listing fields from free-text intake
 * messages (English / romanized Sinhala / Sinhala script). Primary parser for
 * the intake pipeline — pure, synchronous, never returns null, and safe to
 * unit-test with no environment. The flag-gated LLM fallback only fills
 * fields these rules leave null (see ./index.ts).
 */

import { ParsedIntake, computeMissingFields } from './types';
import { matchCity, matchDistrict } from './gazetteer';
import { scoreSuspicion } from './scam';

export const RULES_VERSION = 1;

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
    if (isDepositContext(text, start, start + m[0].length)) continue;
    const value = amount(m);
    if (Number.isFinite(value) && value >= RENT_FLOOR && value <= RENT_CEIL) {
      return Math.round(value);
    }
  }
  return null;
}

function extractRent(lower: string): number | null {
  // Ordered specific → loose; the first pass that yields a plausible amount wins.
  return (
    // "1.2 lakh", "2 lakhs"
    firstRentMatch(lower, /(\d+(?:\.\d+)?)\s*(?:lakhs?|lacs?|laks)\b/g, (m) =>
      Number(m[1]) * 100_000
    ) ??
    // "Rs. 85,000", "LKR 85000", "rs 85k"
    firstRentMatch(
      lower,
      /\b(?:lkr|rs\.?|rupees|slr)\s*:?\s*([\d,]+(?:\.\d+)?)\s*(k\b)?/g,
      (m) => toAmount(m[1], Boolean(m[2]))
    ) ??
    // "85,000/month", "85000 per month", "85k pm", "85000 monthly"
    firstRentMatch(
      lower,
      /([\d,]+(?:\.\d+)?)\s*(k\b)?\s*(?:\/|per\s*)?(?:monthly|month\b|mnth\b|mo\b|pm\b)/g,
      (m) => toAmount(m[1], Boolean(m[2]))
    ) ??
    // "monthly rent 85,000", "rent is 85000", "kuliya 45,000"
    firstRentMatch(
      lower,
      /(?:\b(?:rental|rent|monthly)|kuliya|කුලිය)(?:\s+\p{L}+){0,2}?\s*(?:[:\-]|is|of)?\s*([\d,]{4,}(?:\.\d+)?)\s*(k\b)?/gu,
      (m) => toAmount(m[1], Boolean(m[2]))
    ) ??
    // "85,000/-", "85000/=" (common SL classified style)
    firstRentMatch(lower, /([\d,]{4,})\s*\/[-=]/g, (m) => toAmount(m[1], false)) ??
    // bare "85k"
    firstRentMatch(lower, /(\d+(?:\.\d+)?)\s*k\b/g, (m) => toAmount(m[1], true)) ??
    // bare amount near a rent keyword: "80000 rent"
    firstRentMatch(
      lower,
      /([\d,]{4,})[^\d]{0,30}(?:\b(?:rental|rent|monthly)|kuliya|කුලිය)/gu,
      (m) => toAmount(m[1], false)
    )
  );
}

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
  ]);
}

function extractBathrooms(lower: string): number | null {
  const counted = extractCount(lower, [
    /(\d+)[\s-]*(?:bath\s?rooms?|baths?|washrooms?|toilets?)\b/g,
    /(?:bath\s?rooms?|baths?|washrooms?|toilets?)\s*[:\-]?\s*(\d+)/g,
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
  if (/\b(?:apartments?|flats?|condos?|penthouses?)\b/.test(lower) || lower.includes('මහල්')) {
    return { propertyType: 'apartment', annex: false };
  }
  // "room" only in a renting context — "2 bedrooms" must never classify as room.
  if (
    /\b(?:single|sharing|boarding)\s+rooms?\b|\brooms?\s+(?:for|to)\s+(?:rent|let)\b|\bboarding\b/.test(
      lower
    )
  ) {
    return { propertyType: 'room', annex: false };
  }
  if (
    /\b(?:house|home|bungalow|villa|gedara|gedhara)\b/.test(lower) ||
    /නිවස|ගෙදර/u.test(lower)
  ) {
    return { propertyType: 'house', annex: false };
  }
  return { propertyType: null, annex: false };
}

const ADDRESS_RE =
  /(?:no\.?\s*)?\d+[\p{L}\d/-]*\s*,?\s*(?:[\p{L}][\p{L}\d'.]*\s+){0,4}(?:road|rd|lane|ln|mawatha|mw|place|pl|avenue|ave|street|st|gardens?|terrace|watt[ae]|para|පාර|මාවත)\.?(?=[\s,.]|$)/iu;

function extractAddress(maskedOriginalCase: string, city: string | null): string | null {
  const m = maskedOriginalCase.match(ADDRESS_RE);
  if (!m) return null;
  let address = m[0].replace(/[.,\s]+$/, '');

  // Extend to the following comma segment unless it just repeats the city.
  const rest = maskedOriginalCase.slice((m.index ?? 0) + m[0].length);
  const segment = rest.match(/^\s*,\s*([\p{L}][\p{L}\s'.-]{1,40}?)(?=[,.]|$)/u);
  if (segment) {
    const seg = segment[1].trim();
    if (!city || seg.toLowerCase() !== city.toLowerCase()) {
      address += `, ${seg}`;
    }
  }
  return address;
}

function composeTitle(args: {
  bedrooms: number | null;
  propertyType: ParsedIntake['propertyType'];
  annex: boolean;
  city: string | null;
}): string | null {
  if (!args.city) return null;
  const typeLabel = args.annex
    ? 'Annex'
    : args.propertyType
      ? args.propertyType.charAt(0).toUpperCase() + args.propertyType.slice(1)
      : 'Property';
  return [args.bedrooms ? `${args.bedrooms}BR` : null, typeLabel, 'in', args.city]
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

export function parseIntakeRules(messageText: string): ParsedIntake {
  const original = normalize(messageText ?? '');
  const masked = maskPhones(original);
  const lower = masked.toLowerCase();

  const rentPerMonth = extractRent(lower);
  const bedrooms = extractBedrooms(lower);
  const bathrooms = extractBathrooms(lower);
  const { propertyType, annex } = extractPropertyType(lower);
  const cityMatch = matchCity(lower);
  const city = cityMatch?.city ?? null;
  const district = cityMatch?.district ?? matchDistrict(lower);
  const address = extractAddress(masked, city);
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
    parserMeta: { engine: 'rules', rulesVersion: RULES_VERSION },
  };
  parsed.missingFields = computeMissingFields(parsed);
  return parsed;
}
