/**
 * Turning imported post text into a listing draft.
 *
 * Everything here is REUSE, deliberately. `parseIntake` is the codebase's one
 * "raw ad text → listing fields" implementation — rules first, an LLM pass only
 * for the fields the rules missed — and a Facebook rental ad is the same kind of
 * text as a WhatsApp one, written by the same landlords in the same three
 * languages. A second parser would drift from the first within a month and take
 * the gazetteer, the LKR shorthand ("85k", "1.2 lakh") and the multi-property
 * detection with it.
 *
 * What is NOT shared is the decision made afterwards: the intake pipeline
 * publishes on a passing parse, while an import always stops at a human. So
 * this module extracts and returns; it never judges.
 */

import { parseIntake } from '@/lib/intake/parser';
import type { ParsedIntake } from '@/lib/intake/parser/types';
import { loadLocations } from '@/lib/locations/store';
import { extractPhoneNumbers } from '@/lib/moderation/contact-scrub';
import { withLocationDetail } from './location';
import { fetchOriginal, storeImportedImage, MAX_ORIGINAL_BYTES } from '@/lib/images/store';
import { fetchPastedImage } from './facebook/fetch';

export interface ExtractedDraft {
  parsed: ParsedIntake;
  /** E.164 candidates from the post text, first-written first. */
  phoneCandidates: string[];
  /** A name the advert labelled as the person to contact, if it did. */
  ownerName: string | null;
}

/**
 * Words that follow "contact" without being anybody's name.
 *
 * Sri Lankan adverts say "contact us", "call now", "whatsapp only" far more
 * often than they name a person, and a listing addressed "Hi Now," is worse
 * than one addressed "Hi there," — which is what greetingName already produces
 * for a blank. Erring towards null is therefore free and erring towards a match
 * is not.
 */
const NOT_A_NAME = new Set([
  'us', 'me', 'now', 'today', 'owner', 'agent', 'direct', 'please', 'anytime',
  'the', 'for', 'more', 'details', 'info', 'only', 'whatsapp', 'call', 'via',
  'number', 'no', 'mobile', 'viewing', 'inquiries', 'enquiries', 'seller',
]);

/**
 * The name an advert gives for whoever to call.
 *
 * IMPORTER-ONLY, and deliberately not in the shared parser. `ParsedIntake` has
 * no name field and `FIELD_SPECS` never asks the LLM for one, so adding it
 * there would change what every WhatsApp intake extracts and cost a
 * RULES_VERSION bump plus a probe run — for a field only the importer has any
 * use for. A WhatsApp landlord's name arrives from Meta's own profile.
 *
 * It only ever reads text an OPERATOR pasted. On the `og` path there is no ad
 * body to read, which is the actual reason the field comes back blank on an
 * import — see docs/deep-dive-facebook-post-import.md. This does not change
 * that; it saves retyping once the text is there.
 *
 * Conservative on purpose: a labelled contact word, a capitalised name of one
 * or two words, no digits, and not a stopword. It stays optional either way —
 * `greetingName(null)` renders "Hi there", which is a normal way to open a
 * message and needs no apology.
 */
export function extractOwnerName(text: string | null | undefined): string | null {
  if (!text) return null;

  /*
   * The LABEL is case-insensitive; the NAME is not. An `i` flag on the whole
   * pattern would be wrong in the second half — `[A-Z][a-z]+` is doing real
   * work there, and case-folding it turns "contact for viewing" into the name
   * "for". So the label spells its own capitals out.
   */
  const patterns = [
    // Contact / Call / WhatsApp Nimal — the common English shapes.
    /(?:[Cc]ontact|[Cc]all|[Ww]hats[Aa]pp|[Ii]nquir(?:y|ies)|[Ee]nquir(?:y|ies))\s*(?:[Pp]erson|[Nn]ame)?\s*[:\-–—]?\s*([A-Z][a-z]{1,15}(?:\s+[A-Z][a-z]{1,15})?)/,
    // Mr / Mrs / Ms Perera — a title is strong evidence and worth its own pass.
    /\b(?:Mr|Mrs|Ms|Dr)\.?\s+([A-Z][a-z]{1,15}(?:\s+[A-Z][a-z]{1,15})?)/,
    // Sinhala and Tamil "contact"/"call", followed by a name in either script.
    /(?:අමතන්න|සම්බන්ධ\s*වන්න|தொடர்பு|அழைக்கவும்)\s*[:\-–—]?\s*([\p{Script=Sinhala}\p{Script=Tamil}]{2,20}(?:\s+[\p{Script=Sinhala}\p{Script=Tamil}]{2,20})?)/u,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const name = match?.[1]?.trim();
    if (!name) continue;
    const first = name.split(/\s+/)[0].toLowerCase();
    if (NOT_A_NAME.has(first)) continue;
    return name;
  }
  return null;
}

/**
 * Parse post text into listing fields plus the owner's likely numbers.
 *
 * `loadLocations()` first, as POST /api/listings does: the gazetteer matchers
 * are synchronous and read a per-instance snapshot, so without it a town lookup
 * sees only the 173 built-in towns instead of the ~16k in the locations table —
 * and an unrecognised town is what makes a street address mandatory.
 */
export async function extractFromText(text: string): Promise<ExtractedDraft> {
  await loadLocations();
  const parsed = await parseIntake(text);
  return {
    // A Sri Lankan advert states its location as suburb names with no house
    // number, which neither of the parser's address paths can match — see
    // lib/imports/location.ts. Only fills an address the parse left empty.
    parsed: withLocationDetail(parsed, text),
    phoneCandidates: extractPhoneNumbers(text),
    ownerName: extractOwnerName(text),
  };
}

/**
 * Copy remote post images into our own bucket, returning the public URLs.
 *
 * Sequential on purpose. The pool is `max: 1` behind Supabase's transaction
 * pooler and concurrent work on it wedges the request (commit a3ac4f9); these
 * are HTTP rather than DB calls, but they run inside a server action that also
 * queries, and a handful of images is not worth the risk of establishing the
 * pattern.
 *
 * A URL that fails is dropped, not fatal — the operator can always upload the
 * photo by hand, and half an album beats an error page.
 */
export async function ingestRemoteImages(urls: string[]): Promise<string[]> {
  const stored: string[] = [];
  const startedAt = Date.now();

  for (const url of urls.slice(0, INGEST_HARD_LIMIT)) {
    // fetchOriginal() bounds each download to 15s, but nothing bounded the
    // LOOP -- INGEST_HARD_LIMIT is an abuse ceiling, not a latency one, so a
    // post resolving to several slow/unresponsive CDN URLs burned 15s * N
    // sequentially with the operator staring at a frozen "Fetching..." button
    // the whole time (reported live, minutes-long freeze). Once the budget is
    // spent, keep whatever was stored and stop -- a partial album beats a
    // multi-minute wait for nothing, matching this function's own rule that a
    // failed URL is dropped, not fatal.
    if (Date.now() - startedAt > INGEST_BUDGET_MS) break;

    const original = await fetchOriginal(url).catch(() => null);
    if (!original) continue;
    const publicUrl = await storeImportedImage(original.buffer, original.contentType);
    if (publicUrl) stored.push(publicUrl);
  }

  return stored;
}

/** Wall-clock budget for one import's photo ingestion loop. See the comment above. */
const INGEST_BUDGET_MS = 45_000;

/**
 * Ingest image URLs an OPERATOR pasted, refusing anything off Facebook's CDN.
 *
 * Separate from `ingestRemoteImages` for one reason: provenance. Those URLs
 * came out of a document we had already allowlisted, so `fetchOriginal`'s bare
 * `fetch` was contained. These are a string somebody typed, which is the exact
 * SSRF shape `parseFacebookUrl` refuses at the front door — so they go through
 * `fetchPastedImage`, which vets the host and every redirect hop.
 *
 * Returns the refusal count so the screen can say "3 added, 1 refused" instead
 * of silently keeping fewer photos than the operator pasted.
 */
export async function ingestPastedImageUrls(
  urls: string[]
): Promise<{ stored: string[]; refused: number }> {
  const stored: string[] = [];
  let refused = 0;

  for (const url of urls.slice(0, INGEST_HARD_LIMIT)) {
    const original = await fetchPastedImage(url, MAX_ORIGINAL_BYTES).catch(() => null);
    if (!original) {
      refused++;
      continue;
    }
    const publicUrl = await storeImportedImage(original.buffer, original.contentType);
    if (publicUrl) stored.push(publicUrl);
    else refused++;
  }

  return { stored, refused };
}

/**
 * A ceiling on how many remote images one import will fetch, NOT the photo cap.
 *
 * The listing cap (`photoCap`) is applied at publish, where `capPhotos` and
 * `capRejectEntries` record the over-cap photos in the manifest as rejects.
 * This function used to apply it too, with a bare `break` — so images past the
 * cap were never stored, never reached the manifest, and simply ceased to
 * exist with nothing anywhere saying so. Worse, it made the cap depend on
 * arrival order at ingest time, before the operator had any chance to choose
 * which photos matter or which should be the cover.
 *
 * Ingesting everything and capping at publish is the correct division. This
 * limit exists only so a pasted list of a thousand URLs cannot tie up a server
 * action; it sits far above any real advert.
 */
const INGEST_HARD_LIMIT = 40;
