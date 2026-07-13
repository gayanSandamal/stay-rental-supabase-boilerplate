/**
 * Flag-gated LLM fallback for the intake rule parser (see ./index.ts).
 * Extracts listing fields from free text (English / Sinhala-English mix) via
 * the Anthropic API directly — no SDK dependency. Returns null when
 * ANTHROPIC_API_KEY is unset or the API/JSON fails; callers treat null as
 * "no fill-ins available".
 */

import { ParsedIntake, computeMissingFields } from './types';

const SYSTEM_PROMPT = `You extract rental-listing data from WhatsApp messages sent to Easy Rent, a Sri Lankan house-rental marketplace. Messages may mix English and Sinhala and be informal.

Return ONLY a JSON object with these keys:
- title: short listing title you compose, e.g. "2BR House in Nugegoda" (null if you can't determine bedrooms+type+area)
- propertyType: "house" | "apartment" | "room" | null
- address: street address as given | null
- city: Sri Lankan city | null
- district: Sri Lankan district if stated | null
- bedrooms: integer | null
- bathrooms: integer | null
- rentPerMonth: integer LKR per month (convert "85k"→85000, "1.2 lakh"→120000) | null
- description: 1-3 sentence tidy description composed from what they wrote | null
- suspicious: true if this doesn't look like a genuine property rental submission (spam, scam patterns, gibberish, advertising something else)
- suspicionReason: short reason when suspicious, else null

Never invent facts not present in the message. Unknown → null.`;

export async function parseIntakeWithLlm(messageText: string): Promise<ParsedIntake | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !messageText.trim()) return null;

  const model = process.env.WHATSAPP_INTAKE_MODEL || 'claude-haiku-4-5-20251001';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: messageText }],
    }),
  });

  if (!res.ok) {
    console.error('Intake LLM fallback: Anthropic API error', res.status, await res.text());
    return null;
  }

  const data = await res.json();
  const text: string = data?.content?.[0]?.text ?? '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }

  const parsed: ParsedIntake = {
    title: typeof raw.title === 'string' ? raw.title : null,
    propertyType: ['house', 'apartment', 'room'].includes(raw.propertyType as string)
      ? (raw.propertyType as ParsedIntake['propertyType'])
      : null,
    address: typeof raw.address === 'string' ? raw.address : null,
    city: typeof raw.city === 'string' ? raw.city : null,
    district: typeof raw.district === 'string' ? raw.district : null,
    bedrooms: Number.isFinite(Number(raw.bedrooms)) && Number(raw.bedrooms) > 0 ? Number(raw.bedrooms) : null,
    bathrooms: Number.isFinite(Number(raw.bathrooms)) && Number(raw.bathrooms) > 0 ? Number(raw.bathrooms) : null,
    rentPerMonth:
      Number.isFinite(Number(raw.rentPerMonth)) && Number(raw.rentPerMonth) > 0
        ? Number(raw.rentPerMonth)
        : null,
    description: typeof raw.description === 'string' ? raw.description : null,
    missingFields: [],
    suspicious: raw.suspicious === true,
    suspicionReason: typeof raw.suspicionReason === 'string' ? raw.suspicionReason : null,
  };

  parsed.missingFields = computeMissingFields(parsed);
  return parsed;
}
