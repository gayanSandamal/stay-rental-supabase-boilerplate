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
import { fetchOriginal, storeImportedImage } from '@/lib/images/store';
import { photoCap } from '@/lib/images/cap';

export interface ExtractedDraft {
  parsed: ParsedIntake;
  /** E.164 candidates from the post text, first-written first. */
  phoneCandidates: string[];
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
  return { parsed, phoneCandidates: extractPhoneNumbers(text) };
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
  const cap = photoCap();
  const stored: string[] = [];

  for (const url of urls) {
    if (stored.length >= cap) break;
    const original = await fetchOriginal(url).catch(() => null);
    if (!original) continue;
    const publicUrl = await storeImportedImage(original.buffer, original.contentType);
    if (publicUrl) stored.push(publicUrl);
  }

  return stored;
}
