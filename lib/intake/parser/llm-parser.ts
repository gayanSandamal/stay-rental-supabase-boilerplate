/**
 * Flag-gated LLM fallback for the intake rule parser (see ./index.ts).
 * Extracts listing fields from free text (English / Sinhala-English mix).
 * Provider is picked by which key is deployed: SiliconFlow (the vendor the
 * moderation pipeline already uses, OpenAI-compatible) wins over the direct
 * Anthropic API. Returns null when no key is set or the API/JSON fails;
 * callers treat null as "no fill-ins available".
 */

import { MODERATION_API_BASE, moderationApiKey } from '@/lib/moderation/config';
import { ParsedIntake, computeMissingFields } from './types';

const LLM_TIMEOUT_MS = 8_000;

const PREAMBLE = `You extract rental-listing data from WhatsApp messages sent to Easy Rent, a Sri Lankan house-rental marketplace. Messages may mix English and Sinhala and be informal.`;

const FOOTER = `Never invent facts not present in the message. Unknown → null.`;

/** One description per extractable field, shared by both provider prompts. */
const FIELD_SPECS: Record<string, string> = {
  title: `title: short listing title you compose, e.g. "2BR House in Nugegoda" (null if you can't determine bedrooms+type+area)`,
  propertyType: `propertyType: "house" | "apartment" | "room" | null`,
  address: `address: street address as given | null`,
  city: `city: Sri Lankan city | null`,
  district: `district: Sri Lankan district if stated | null`,
  bedrooms: `bedrooms: integer | null`,
  bathrooms: `bathrooms: integer | null`,
  rentPerMonth: `rentPerMonth: integer LKR per month (convert "85k"→85000, "1.2 lakh"→120000) | null`,
  description: `description: 1-3 sentence tidy description composed from what they wrote | null`,
};

export function isLlmParserConfigured(): boolean {
  return Boolean(moderationApiKey() || process.env.ANTHROPIC_API_KEY);
}

export async function parseIntakeWithLlm(
  messageText: string,
  missingFields: string[] = []
): Promise<ParsedIntake | null> {
  if (!isLlmParserConfigured() || !messageText.trim()) return null;

  // Fail-soft is non-negotiable: a throwing fallback would break intake
  // processing, and the rules-only result is always an acceptable answer.
  try {
    if (moderationApiKey()) return await parseWithSiliconFlow(messageText, missingFields);
    return await parseWithAnthropic(messageText);
  } catch (err) {
    console.error('Intake LLM fallback failed', err instanceof Error ? err.message : err);
    return null;
  }
}

async function parseWithSiliconFlow(
  messageText: string,
  missingFields: string[]
): Promise<ParsedIntake | null> {
  const wanted = missingFields.filter((f) => f in FIELD_SPECS);
  if (wanted.length === 0) return null;

  const model = process.env.INTAKE_LLM_MODEL || 'Qwen/Qwen3-8B';

  const system = `${PREAMBLE}

A deterministic parser already handled this message; extract ONLY the fields it could not find.

Return ONLY a JSON object with exactly these keys:
${wanted.map((f) => `- ${FIELD_SPECS[f]}`).join('\n')}

${FOOTER}`;

  const res = await fetch(`${MODERATION_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${moderationApiKey()}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: messageText },
      ],
      max_tokens: 400,
      temperature: 0,
      response_format: { type: 'json_object' },
      // Qwen3 hybrid models otherwise spend the whole token budget thinking
      // and the content comes back as "{}".
      enable_thinking: false,
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('Intake LLM fallback: SiliconFlow API error', res.status, text.slice(0, 300));
    return null;
  }

  const data = await res.json();
  return coerceParsed(data?.choices?.[0]?.message?.content ?? '');
}

async function parseWithAnthropic(messageText: string): Promise<ParsedIntake | null> {
  const model = process.env.WHATSAPP_INTAKE_MODEL || 'claude-haiku-4-5-20251001';

  const system = `${PREAMBLE}

Return ONLY a JSON object with these keys:
${Object.values(FIELD_SPECS)
  .map((s) => `- ${s}`)
  .join('\n')}
- suspicious: true if this doesn't look like a genuine property rental submission (spam, scam patterns, gibberish, advertising something else)
- suspicionReason: short reason when suspicious, else null

${FOOTER}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: messageText }],
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('Intake LLM fallback: Anthropic API error', res.status, text.slice(0, 300));
    return null;
  }

  const data = await res.json();
  return coerceParsed(data?.content?.[0]?.text ?? '');
}

/** Malformed model output must coerce to null field-by-field, never throw. */
function coerceParsed(text: string): ParsedIntake | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }

  // Constrained JSON decoding often yields "" instead of null for unknowns —
  // '' would count as "present" in computeMissingFields and publish a listing
  // with a blank title/city.
  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v.trim() : null;

  const parsed: ParsedIntake = {
    title: str(raw.title),
    propertyType: ['house', 'apartment', 'room'].includes(raw.propertyType as string)
      ? (raw.propertyType as ParsedIntake['propertyType'])
      : null,
    address: str(raw.address),
    city: str(raw.city),
    district: str(raw.district),
    bedrooms: Number.isFinite(Number(raw.bedrooms)) && Number(raw.bedrooms) > 0 ? Number(raw.bedrooms) : null,
    bathrooms: Number.isFinite(Number(raw.bathrooms)) && Number(raw.bathrooms) > 0 ? Number(raw.bathrooms) : null,
    rentPerMonth:
      Number.isFinite(Number(raw.rentPerMonth)) && Number(raw.rentPerMonth) > 0
        ? Number(raw.rentPerMonth)
        : null,
    description: str(raw.description),
    missingFields: [],
    suspicious: raw.suspicious === true,
    suspicionReason: str(raw.suspicionReason),
  };

  parsed.missingFields = computeMissingFields(parsed);
  return parsed;
}
