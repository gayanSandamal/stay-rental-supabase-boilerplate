/**
 * Intake parser orchestrator: deterministic rules first, then an optional
 * flag-gated LLM pass that only fills fields the rules left null. Unlike the
 * old LLM-only parser this never returns null — an unparseable message just
 * comes back with missingFields set, which routes the intake to needs_info.
 */

import { isFeatureEnabled } from '@/lib/feature-flags';
import { ParsedIntake, computeMissingFields } from './types';
import { parseIntakeRules, RULES_VERSION } from './rule-parser';
import { isLlmParserConfigured, parseIntakeWithLlm } from './llm-parser';
import { normalizeLocation } from './gazetteer';

export type { ParsedIntake } from './types';
export { REQUIRED_FIELDS } from './types';

export async function parseIntake(messageText: string): Promise<ParsedIntake> {
  const rule = parseIntakeRules(messageText);

  // Suspicious content goes straight to manual review — no tokens spent on it.
  if (rule.suspicious) return rule;

  const wantLlm =
    rule.missingFields.length > 0 &&
    isFeatureEnabled('enableLlmParserFallback') &&
    isLlmParserConfigured();
  if (!wantLlm) return rule;

  const llm = await parseIntakeWithLlm(messageText, rule.missingFields);
  if (!llm) {
    // Mark the dark fallback in parsedPayload so a misconfigured model id is
    // visible in the back office instead of masquerading as "fields absent".
    rule.parserMeta = { ...rule.parserMeta!, llmFailed: true };
    return rule;
  }

  return mergeParsed(rule, llm);
}

/** Rule values win when non-null; the LLM only fills the gaps. */
function mergeParsed(rule: ParsedIntake, llm: ParsedIntake): ParsedIntake {
  const merged: ParsedIntake = {
    title: rule.title ?? llm.title,
    propertyType: rule.propertyType ?? llm.propertyType,
    address: rule.address ?? llm.address,
    city: rule.city ?? llm.city,
    district: rule.district ?? llm.district,
    bedrooms: rule.bedrooms ?? llm.bedrooms,
    bathrooms: rule.bathrooms ?? llm.bathrooms,
    rentPerMonth: rule.rentPerMonth ?? llm.rentPerMonth,
    description: rule.description ?? llm.description,
    missingFields: [],
    suspicious: rule.suspicious || llm.suspicious,
    suspicionReason:
      [rule.suspicionReason, llm.suspicionReason].filter(Boolean).join(' + ') || null,
    // Safety flags must survive the merge — dropping multiProperty here would
    // let a two-properties-in-one-message submission publish as one listing.
    multiProperty: Boolean(rule.multiProperty || llm.multiProperty),
    parserMeta: { engine: 'rules+llm', rulesVersion: RULES_VERSION },
  };
  // The rule parser can only ever emit a gazetteer town, because its city comes
  // from matchCity. The LLM is under no such constraint — it is asked for a
  // "Sri Lankan city" as free text, and it exists precisely to name towns the
  // gazetteer misses. Left raw, that is how an uncanonical spelling reaches a
  // column the search filter matches with `eq`. Normalising here canonicalises
  // what IS known and derives the district, while still keeping a genuine small
  // town the LLM found.
  const location = normalizeLocation(merged.city, merged.district);
  merged.city = location.city || null;
  merged.district = location.district;
  // The rules compose a cityless title ("3BR House") when the gazetteer misses
  // the town; if the LLM recovered the city, retrofit it — otherwise the
  // listing publishes titled without its location.
  if (merged.title && merged.city && !/\bin\b/i.test(merged.title)) {
    merged.title = `${merged.title} in ${merged.city}`;
  }
  merged.missingFields = computeMissingFields(merged);
  return merged;
}
