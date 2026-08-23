/**
 * Landlord-facing copy in the language the landlord wrote in.
 *
 * WHY THIS SHAPE. English is not stored here. Every builder in `messages.ts`
 * keeps its existing English literal as its default path, and only reaches for a
 * translation when `lang !== 'en'`:
 *
 *     t(lang, 'receivedAck', { name }) ?? `Got it${name ? ', ' + name : ''}! …`
 *
 * So the English path is byte-for-byte the code that was already running — the
 * path 100% of today's traffic takes — and Sinhala/Tamil are purely additive. A
 * missing key falls back to English rather than throwing or printing a key,
 * because a half-translated message is worse than an English one.
 *
 * OPERATIVE TOKENS ARE NOT FREELY TRANSLATABLE. Copy that tells a landlord to
 * reply DELETE / CANCEL / RESTORE / YES is matched by `lib/intake/commands.ts`.
 * Those literals must survive into every translation, which is why the Sinhala
 * and Tamil strings keep them in Latin caps alongside the native instruction —
 * and why `tests/unit/intake-i18n.test.ts` asserts it. A translation that
 * quietly dropped "DELETE" would break the deletion promise the platform makes
 * to landlords.
 *
 * ⚠️ THE SINHALA AND TAMIL COPY IS A DRAFT awaiting native review. It is why
 * `enableLocalizedReplies` defaults to OFF.
 */

import { isFeatureEnabled } from '@/lib/feature-flags';
import type { ReplyLang } from '../language';
import { si } from './si';
import { ta } from './ta';

/** Every string this module can translate. The value is the English gloss, for reviewers. */
export type MsgKey =
  | 'receivedAck'
  | 'updateAck'
  | 'manualReview'
  | 'needsInfo'
  | 'needsInfoNoFields'
  | 'needsInfoEcho'
  | 'listJoin'
  | 'field.title'
  | 'field.address'
  | 'field.city'
  | 'field.bedrooms'
  | 'field.rentPerMonth'
  | 'understood.bedrooms'
  | 'understood.city'
  | 'understood.rent'
  | 'type.house'
  | 'type.apartment'
  | 'type.room'
  | 'type.annex'
  | 'published.live'
  | 'published.edit'
  | 'published.remove'
  | 'published.photos'
  | 'published.contact'
  | 'goLive'
  | 'pendingReview'
  | 'photosAdded'
  | 'photosMissed'
  | 'help'
  | 'delete.which'
  | 'delete.replyNumber'
  | 'delete.confirm'
  | 'delete.done'
  | 'delete.cancelled'
  | 'saleAd'
  | 'socialConsent';

export type Catalogue = Partial<Record<MsgKey, string>>;

const CATALOGUES: Record<Exclude<ReplyLang, 'en'>, Catalogue> = { si, ta };

/** `{name}` → params.name. Missing params render as empty, never as "{name}". */
function interpolate(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    params[key] === undefined || params[key] === null ? '' : String(params[key])
  );
}

/**
 * The translated string, or null to use the caller's English.
 *
 * Returns null when the flag is off, when the language is English, or when the
 * key has no translation — so every caller's `?? englishLiteral` is the single
 * fallback path.
 */
export function t(
  lang: ReplyLang,
  key: MsgKey,
  params: Record<string, string | number> = {}
): string | null {
  if (lang === 'en') return null;
  // Checked here rather than at each of ~30 call sites: with the flag off every
  // builder returns exactly what it returned before this module existed.
  if (!isFeatureEnabled('enableLocalizedReplies')) return null;

  const template = CATALOGUES[lang]?.[key];
  if (!template) return null;
  return interpolate(template, params);
}

/** Keys present in a catalogue — used by the coverage test, not at runtime. */
export function catalogueFor(lang: Exclude<ReplyLang, 'en'>): Catalogue {
  return CATALOGUES[lang];
}
