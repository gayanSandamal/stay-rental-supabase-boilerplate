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

interface TextResponse {
  language?: string;
  title_matches_description?: boolean;
  title_mismatch_reason?: string | null;
  location_consistent?: boolean;
  location_mismatch_reason?: string | null;
  looks_like_rental_listing?: boolean;
  spam_reason?: string | null;
  confidence?: number;
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

  const reasons: string[] = [];
  if (d.title_mismatch_reason) reasons.push(d.title_mismatch_reason);
  if (d.location_mismatch_reason) reasons.push(d.location_mismatch_reason);
  if (d.spam_reason) reasons.push(d.spam_reason);

  return {
    verdict: {
      language,
      languageSupported: isSupportedLanguage(language),
      // Default to coherent when the model omits a field: never hold a listing
      // on a missing key.
      titleCoherent: d.title_matches_description !== false,
      locationCoherent: d.location_consistent !== false,
      looksLikeRental: d.looks_like_rental_listing !== false,
      reasons,
      deterministicNotes,
    },
    usage,
    error: null,
  };
}
