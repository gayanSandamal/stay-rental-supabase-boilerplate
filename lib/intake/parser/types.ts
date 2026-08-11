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

/**
 * Did the sender already describe a property? True when ANY listing field
 * landed — not just the required ones, because the question is "do they know
 * what to send", not "can we publish".
 *
 * Drives the first-contact reply: someone who already sent details must not be
 * handed a checklist asking for what they just typed (it reads as "the bot
 * ignored my message"), while someone who opens with "hi" needs exactly that.
 * A partial submission gets the plain ack too — the processing job follows with
 * a needs-info reply that names only the gaps and echoes what was understood.
 */
export function hasListingDetail(parsed: ParsedIntake): boolean {
  // propertyType alone does NOT count: "I want to list my house" extracts a
  // type and nothing else, and that sender needs the checklist most. A concrete
  // fact about the property is the signal that they have started describing it.
  return Boolean(
    parsed.city || parsed.address || parsed.bedrooms || parsed.bathrooms || parsed.rentPerMonth
  );
}
