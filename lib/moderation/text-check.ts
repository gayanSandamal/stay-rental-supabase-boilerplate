/**
 * Text checks: language, title↔description coherence, location coherence.
 *
 * Deterministic work happens first and can settle the case for free:
 *  - an unsupported script never reaches the model (zero tokens)
 *  - Sinhala/Tamil script is conclusive about language
 *  - gazetteer contradictions are conclusive about location
 * The model is only asked to judge what rules genuinely cannot.
 */

import { chatJson } from './client';
import { MODERATION_TEXT_MODEL } from './config';
import { analyzeScript, isSupportedLanguage, scriptIsConclusive } from './language';
import { checkLocationCoherence, type LocationInput } from './location';
import { buildTextCheckUser, TEXT_CHECK_SYSTEM } from './prompts';
import type { TextVerdict } from './types';

interface PropertyShape {
  type?: string | null;
  bedrooms?: number | null;
}

interface TextResponse {
  language?: string;
  title_property?: PropertyShape;
  description_property?: PropertyShape;
  describes_same_property?: boolean;
  difference_reason?: string | null;
  location_consistent?: boolean;
  location_mismatch_reason?: string | null;
  looks_like_rental_listing?: boolean;
  spam_reason?: string | null;
  confidence?: number;
}

/**
 * A shared room is not a house; a house is not an apartment. Our parser stores
 * "annex" as a house, so those two are compatible. 'unknown' never disagrees.
 */
const TYPE_GROUP: Record<string, string> = {
  house: 'whole',
  annex: 'whole',
  apartment: 'apartment',
  room: 'room',
};

/**
 * Compare what the title and the description each describe, in code rather than
 * asking the model for a verdict. Extraction is far more reliable than
 * judgement: an 8B model happily called "3BR House" coherent with "single room,
 * shared kitchen" when simply asked, but reports the two shapes correctly.
 */
export function comparePropertyShapes(
  title: PropertyShape | undefined,
  description: PropertyShape | undefined
): { coherent: boolean; reason: string | null } {
  const tType = (title?.type ?? 'unknown').toLowerCase();
  const dType = (description?.type ?? 'unknown').toLowerCase();
  const tGroup = TYPE_GROUP[tType];
  const dGroup = TYPE_GROUP[dType];

  if (tGroup && dGroup && tGroup !== dGroup) {
    return {
      coherent: false,
      reason: `Title describes a ${tType} but the description describes a ${dType}.`,
    };
  }

  const tBeds = typeof title?.bedrooms === 'number' ? title.bedrooms : null;
  const dBeds = typeof description?.bedrooms === 'number' ? description.bedrooms : null;
  if (tBeds !== null && dBeds !== null && tBeds !== dBeds) {
    return {
      coherent: false,
      reason: `Title says ${tBeds} bedroom(s) but the description says ${dBeds}.`,
    };
  }

  return { coherent: true, reason: null };
}

export interface TextCheckOutcome {
  verdict: TextVerdict;
  usage: { inputTokens: number; outputTokens: number };
  error: string | null;
}

export async function checkText(listing: LocationInput): Promise<TextCheckOutcome> {
  const usage = { inputTokens: 0, outputTokens: 0 };
  const corpus = [listing.title, listing.description].filter(Boolean).join('\n');
  const script = analyzeScript(corpus);
  const location = checkLocationCoherence(listing);

  const deterministicNotes = [...location.softNotes];

  // 1. Unsupported script → decided here, no tokens spent.
  if (script.verdict === 'other') {
    return {
      verdict: {
        language: `other:${script.otherScript ?? 'unknown script'}`,
        languageSupported: false,
        titleCoherent: true,
        locationCoherent: !location.hardFail,
        looksLikeRental: true,
        reasons: [`Text is written in ${script.otherScript ?? 'an unsupported script'}.`],
        deterministicNotes,
      },
      usage,
      error: null,
    };
  }

  // 2. Hard location contradiction → decided here too.
  if (location.hardFail) {
    const scriptLang =
      script.verdict === 'si' ? 'si' : script.verdict === 'ta' ? 'ta' : script.verdict === 'si+ta' ? 'si+ta' : 'en';
    return {
      verdict: {
        language: scriptLang,
        languageSupported: true,
        titleCoherent: true,
        locationCoherent: false,
        looksLikeRental: true,
        reasons: location.hardReasons,
        deterministicNotes,
      },
      usage,
      error: null,
    };
  }

  const res = await chatJson<TextResponse>({
    model: MODERATION_TEXT_MODEL,
    system: TEXT_CHECK_SYSTEM,
    user: buildTextCheckUser({
      title: listing.title ?? null,
      description: listing.description ?? null,
      address: listing.address ?? null,
      city: listing.city ?? null,
      district: listing.district ?? null,
      notes: deterministicNotes,
    }),
    maxTokens: 500,
  });
  usage.inputTokens += res.usage.inputTokens;
  usage.outputTokens += res.usage.outputTokens;

  if (res.error || !res.data) {
    // Script detection still gives a usable language answer even without the model.
    const fallbackLang = scriptIsConclusive(script)
      ? script.verdict === 'si+ta'
        ? 'si+ta'
        : script.verdict
      : 'en';
    return {
      verdict: {
        language: fallbackLang,
        languageSupported: isSupportedLanguage(fallbackLang),
        titleCoherent: true,
        locationCoherent: true,
        looksLikeRental: true,
        reasons: [],
        deterministicNotes,
      },
      usage,
      error: res.error ?? 'no_text_result',
    };
  }

  const d = res.data;
  // Script beats the model on Sinhala/Tamil: the ranges are unambiguous, and a
  // model occasionally calls romanized Sinhala "Indonesian".
  const modelLang = (d.language ?? 'en').trim();
  const language = scriptIsConclusive(script)
    ? script.verdict === 'si+ta'
      ? 'si+ta'
      : script.verdict
    : modelLang;

  // Coherence is computed from the extracted shapes, not taken as the model's
  // opinion. The model's own same/different flag is only allowed to ADD a
  // failure, never to overturn a mismatch we detected.
  const shapes = comparePropertyShapes(d.title_property, d.description_property);
  const modelSaysDifferent = d.describes_same_property === false;
  const titleCoherent = shapes.coherent && !modelSaysDifferent;

  const reasons: string[] = [];
  if (shapes.reason) reasons.push(shapes.reason);
  if (modelSaysDifferent && d.difference_reason) reasons.push(d.difference_reason);
  if (d.location_mismatch_reason) reasons.push(d.location_mismatch_reason);
  if (d.spam_reason) reasons.push(d.spam_reason);

  return {
    verdict: {
      language,
      languageSupported: isSupportedLanguage(language),
      titleCoherent,
      // Default to coherent when the model omits a field: never hold a listing
      // on a missing key.
      locationCoherent: d.location_consistent !== false,
      looksLikeRental: d.looks_like_rental_listing !== false,
      reasons,
      deterministicNotes,
    },
    usage,
    error: null,
  };
}
