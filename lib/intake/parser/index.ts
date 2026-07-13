/**
 * Intake parser orchestrator: deterministic rules first, then an optional
 * flag-gated LLM pass that only fills fields the rules left null. Unlike the
 * old LLM-only parser this never returns null — an unparseable message just
 * comes back with missingFields set, which routes the intake to needs_info.
 */

import { isFeatureEnabled } from '@/lib/feature-flags';
import { ParsedIntake, computeMissingFields } from './types';
import { parseIntakeRules, RULES_VERSION } from './rule-parser';
import { parseIntakeWithLlm } from './llm-parser';

export type { ParsedIntake } from './types';
export { REQUIRED_FIELDS } from './types';

export async function parseIntake(messageText: string): Promise<ParsedIntake> {
  const rule = parseIntakeRules(messageText);

  // Suspicious content goes straight to manual review — no tokens spent on it.
  if (rule.suspicious) return rule;

  const wantLlm =
    rule.missingFields.length > 0 &&
    isFeatureEnabled('enableLlmParserFallback') &&
    Boolean(process.env.ANTHROPIC_API_KEY);
  if (!wantLlm) return rule;

  const llm = await parseIntakeWithLlm(messageText);
  if (!llm) return rule;

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
    parserMeta: { engine: 'rules+llm', rulesVersion: RULES_VERSION },
  };
  merged.missingFields = computeMissingFields(merged);
  return merged;
}
