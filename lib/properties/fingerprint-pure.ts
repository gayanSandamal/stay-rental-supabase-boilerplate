import crypto from 'crypto';

/**
 * The pure half of lib/properties/fingerprint.ts, split out so it can be
 * unit-tested directly — the rest of that file imports 'server-only' (DB
 * access), which throws when imported outside a server bundle, the same
 * reason lib/listings/publisher-info.ts and view-totals.ts have no direct
 * unit tests and are instead tested via source-text assertions. A fuzzy
 * address+city+bedrooms fingerprint has real branching logic worth testing
 * directly, so it lives here instead.
 *
 * See lib/properties/fingerprint.ts for the full rationale (this is not a
 * geocoder, and both false positives and false negatives are acceptable —
 * see that file's header comment).
 */

const WORD_REPLACEMENTS: Record<string, string> = {
  road: 'rd',
  street: 'st',
  avenue: 'ave',
  lane: 'ln',
  mawatha: 'mw',
  gardens: 'gdn',
  garden: 'gdn',
  place: 'pl',
};

// House-number markers ("No.12", "#12") carry no identity of their own —
// they always precede the number that follows, so dropping the word
// entirely (rather than mapping it to something) is what makes "12 Galle
// Rd" and "No.12, Galle Road" collide. By the time this filter runs,
// punctuation has already been stripped to spaces, so "no." has already
// become the bare token "no" — both spellings are listed for clarity, but
// only 'no' can actually match at this point in the pipeline.
const FILLER_WORDS = new Set(['no.', 'no', '#']);

function normalizeAddress(address: string): string {
  let s = address.toLowerCase().trim();
  s = s.replace(/[.,#]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  const words = s
    .split(' ')
    .filter((w) => !FILLER_WORDS.has(w))
    .map((w) => WORD_REPLACEMENTS[w] ?? w);
  return words.join(' ');
}

export function computeFingerprint(input: {
  address: string | null;
  city: string;
  bedrooms: number | null;
}): string | null {
  if (!input.address) return null; // no address, no fingerprint — never guess
  const normalized = normalizeAddress(input.address);
  if (normalized.length < 4) return null; // too little signal to be worth grouping on
  const key = `${input.city.toLowerCase().trim()}|${normalized}|${input.bedrooms ?? ''}`;
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 48);
}
