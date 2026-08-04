/**
 * Shared parser contract for the intake pipeline. Dependency-free by design —
 * these types are consumed by the pure rule parser (unit-tested without any
 * Next/DB setup) and by the flag-gated LLM fallback.
 */

export interface ParsedIntake {
  title: string | null;
  propertyType: 'house' | 'apartment' | 'room' | null;
  address: string | null;
  city: string | null;
  district: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  rentPerMonth: number | null;
  description: string | null;
  /** Required-for-publication fields the message didn't contain. */
  missingFields: string[];
  /** Flag for content that looks off (spam/scam/not-a-rental). */
  suspicious: boolean;
  suspicionReason: string | null;
  /**
   * Message appears to describe more than one property (two cities + two
   * amounts, or an explicit "I have two houses…"). One intake = one listing,
   * so checks route this back to the sender to split.
   */
  multiProperty?: boolean;
  /** Diagnostics: which engine produced the payload (persisted in parsedPayload). */
  parserMeta?: { engine: 'rules' | 'rules+llm'; rulesVersion: number; llmFailed?: boolean };
}

export const REQUIRED_FIELDS = [
  'title',
  'address',
  'city',
  'bedrooms',
  'rentPerMonth',
] as const;

export function computeMissingFields(parsed: ParsedIntake): string[] {
  return REQUIRED_FIELDS.filter((f) => parsed[f] == null);
}
