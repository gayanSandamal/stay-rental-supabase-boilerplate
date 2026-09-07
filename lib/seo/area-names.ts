/**
 * Sinhala and Tamil names for a place, for display on public pages.
 *
 * The gazetteer already carries both scripts for every curated town — they are
 * there so the WhatsApp intake parser can recognise a landlord who types
 * "නුගේගොඩ", and tests/unit/gazetteer.test.ts asserts each town has one of each.
 * Rendering them costs nothing and covers the same query typed in either
 * script, which is how a large share of renters in Sri Lanka actually search.
 * ikman and LankaPropertyWeb are both fully trilingual; this is the cheapest
 * first step toward parity.
 *
 * ── What counts as a name, and what does not ───────────────────────────────
 * `aliases` is a mixed bag by design: it holds Latin-script variants and
 * misspellings ('mt lavinia', 'colpetty', 'galkissa') alongside the Sinhala and
 * Tamil forms. Only the non-Latin entries are real alternate names — printing
 * 'mt. lavinia' under a heading would look like a typo, and feeding
 * misspellings to search engines as alternate names is a spam signal. So the
 * filter is on SCRIPT, not on position in the list.
 */

import { CITIES } from '@/lib/intake/parser/gazetteer';

const SINHALA = /[\u0D80-\u0DFF]/;
const TAMIL = /[\u0B80-\u0BFF]/;

const ALIASES_BY_NAME = new Map<string, string[]>();
for (const city of CITIES) {
  const scripts = (city.aliases ?? []).filter((a) => SINHALA.test(a) || TAMIL.test(a));
  if (scripts.length > 0) ALIASES_BY_NAME.set(city.name.toLowerCase(), scripts);
}

/**
 * Sinhala/Tamil forms of a place name, or `[]` when the gazetteer has none.
 *
 * Districts and the ~16k extended `locations` rows carry no script aliases, so
 * an empty array is the normal case for anything outside the curated 173 —
 * callers must render nothing rather than a placeholder.
 */
export function cityAliases(name: string): string[] {
  return ALIASES_BY_NAME.get(name.trim().toLowerCase()) ?? [];
}
