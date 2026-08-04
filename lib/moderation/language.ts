/**
 * Deterministic script detection. Pure and unit-testable — it runs before any
 * model call so an unsupported script costs zero tokens.
 *
 * Sinhala and Tamil are decided here by Unicode range. English vs any other
 * Latin-script language cannot be told apart by script, so Latin text is
 * reported as `latn` and the text-check model has the final say.
 */

export type ScriptVerdict =
  | 'si' // Sinhala script
  | 'ta' // Tamil script
  | 'si+ta' // both (bilingual ad)
  | 'latn' // Latin — needs model confirmation (English? romanized? something else?)
  | 'other' // a script we don't support
  | 'unknown'; // no letters at all (digits/punctuation/emoji only)

const SINHALA = /[඀-෿]/;
const TAMIL = /[஀-௿]/;
const LATIN = /[A-Za-z]/;

/** Scripts that immediately disqualify a listing from the automated path. */
const OTHER_SCRIPTS: Array<[string, RegExp]> = [
  ['Devanagari', /[ऀ-ॿ]/],
  ['Arabic', /[؀-ۿݐ-ݿ]/],
  ['Bengali', /[ঀ-৿]/],
  ['Malayalam', /[ഀ-ൿ]/],
  ['Telugu', /[ఀ-౿]/],
  ['Kannada', /[ಀ-೿]/],
  ['Thai', /[฀-๿]/],
  ['Cyrillic', /[Ѐ-ӿ]/],
  ['Greek', /[Ͱ-Ͽ]/],
  ['Hebrew', /[֐-׿]/],
  ['CJK', /[぀-ヿ一-鿿가-힯]/],
];

export interface ScriptAnalysis {
  verdict: ScriptVerdict;
  /** Named script when verdict is 'other', for the ops notification. */
  otherScript: string | null;
  counts: { sinhala: number; tamil: number; latin: number; other: number; letters: number };
}

/**
 * A 10% share is enough to call Sinhala or Tamil: these listings routinely mix
 * in Latin digits, city names, "sqft", "BR" and phone numbers, so requiring a
 * majority would misclassify normal ads as Latin.
 */
const SHARE_THRESHOLD = 0.1;

export function analyzeScript(text: string): ScriptAnalysis {
  const counts = { sinhala: 0, tamil: 0, latin: 0, other: 0, letters: 0 };
  let otherScript: string | null = null;

  for (const ch of text ?? '') {
    if (SINHALA.test(ch)) {
      counts.sinhala++;
      counts.letters++;
      continue;
    }
    if (TAMIL.test(ch)) {
      counts.tamil++;
      counts.letters++;
      continue;
    }
    if (LATIN.test(ch)) {
      counts.latin++;
      counts.letters++;
      continue;
    }
    for (const [name, re] of OTHER_SCRIPTS) {
      if (re.test(ch)) {
        counts.other++;
        counts.letters++;
        otherScript ??= name;
        break;
      }
    }
  }

  if (counts.letters === 0) {
    return { verdict: 'unknown', otherScript: null, counts };
  }

  const share = (n: number) => n / counts.letters;
  // An unsupported script present in any real quantity disqualifies immediately.
  if (share(counts.other) >= SHARE_THRESHOLD) {
    return { verdict: 'other', otherScript, counts };
  }

  const hasSinhala = share(counts.sinhala) >= SHARE_THRESHOLD;
  const hasTamil = share(counts.tamil) >= SHARE_THRESHOLD;
  if (hasSinhala && hasTamil) return { verdict: 'si+ta', otherScript: null, counts };
  if (hasSinhala) return { verdict: 'si', otherScript: null, counts };
  if (hasTamil) return { verdict: 'ta', otherScript: null, counts };
  return { verdict: 'latn', otherScript: null, counts };
}

/** Languages that may auto-publish (owner decision: Sinhala, Tamil, English). */
export const SUPPORTED_LANGUAGES = new Set(['en', 'si', 'ta', 'si-Latn', 'ta-Latn', 'si+ta']);

export function isSupportedLanguage(language: string): boolean {
  return SUPPORTED_LANGUAGES.has(language);
}

/**
 * Does the deterministic pass alone settle it? Sinhala/Tamil script is
 * conclusive (supported), an unsupported script is conclusive (hold). Latin
 * needs the model, because English and, say, Indonesian look identical here.
 */
export function scriptIsConclusive(a: ScriptAnalysis): boolean {
  return a.verdict === 'si' || a.verdict === 'ta' || a.verdict === 'si+ta' || a.verdict === 'other';
}
