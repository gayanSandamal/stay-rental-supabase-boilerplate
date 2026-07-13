/**
 * Heuristic suspicion scoring — replaces the LLM's self-reported "suspicious"
 * flag. Additive signals; total >= 3 marks the intake suspicious, which is a
 * NON-retriable check failure → manual_review (a human always sees it, the
 * sender is never auto-replied). Pure and deterministic.
 */

export interface SuspicionInput {
  rentPerMonth: number | null;
  bedrooms: number | null;
  city: string | null;
  address: string | null;
}

const SUSPICION_THRESHOLD = 3;

const SCAM_FAMILIES: Array<{ reason: string; re: RegExp }> = [
  { reason: 'money-transfer service', re: /western union|moneygram|money gram/i },
  { reason: 'gift cards', re: /gift ?cards?/i },
  { reason: 'crypto', re: /bitcoin|crypto|usdt|binance|forex/i },
  { reason: 'investment scheme', re: /investment (?:plan|opportunity|scheme)|guaranteed returns?/i },
  { reason: 'loan offer', re: /loan (?:offers?|approvals?)|(?:easy|quick|instant) loans?/i },
  { reason: 'work-from-home bait', re: /earn (?:from home|money fast|per day)|work from home/i },
  { reason: 'job offer', re: /job (?:vacanc|offers?|opportunit)/i },
  { reason: 'visa offer', re: /visa (?:sponsorship|guaranteed)/i },
  { reason: 'lottery/prize', re: /lottery|prize|winner|you (?:have )?won/i },
  { reason: 'credential phishing', re: /\botp\b|verification code|pin number/i },
];

const URL_RE = /https?:\/\/|www\.|bit\.ly|tinyurl|wa\.me\/|t\.me\//i;

const RENTAL_SIGNAL_RE =
  /rent|rental|house|home|apartment|flat|annex|room|bed|property|boarding|kuliya|gedara|නිවස|ගෙදර|කාමර|කුලිය/i;

export function scoreSuspicion(
  text: string,
  extracted: SuspicionInput
): { suspicious: boolean; reason: string | null } {
  const reasons: string[] = [];
  let score = 0;

  for (const family of SCAM_FAMILIES) {
    if (family.re.test(text)) {
      score += 3;
      reasons.push(family.reason);
    }
  }

  if (URL_RE.test(text)) {
    score += 2;
    reasons.push('contains a link');
  }

  const nothingExtracted =
    extracted.rentPerMonth == null &&
    extracted.bedrooms == null &&
    extracted.city == null &&
    extracted.address == null;

  // Gibberish detection is gated on "no fields extracted" so terse-but-real
  // messages heavy on digits ("2BR 85k ...") can never trip it.
  if (text.length > 20 && extracted.rentPerMonth == null && extracted.city == null) {
    const letters = text.match(/\p{L}/gu) ?? [];
    const nonSpace = text.replace(/\s/g, '').length;
    const latinOnly = letters.length > 0 && letters.every((ch) => /[a-z]/i.test(ch));
    const vowelRatio = latinOnly
      ? (text.match(/[aeiou]/gi) ?? []).length / letters.length
      : 1;
    if (nonSpace > 0 && (letters.length / nonSpace < 0.4 || vowelRatio < 0.2)) {
      score += 3;
      reasons.push('gibberish text');
    }
  }

  if (text.length > 30 && nothingExtracted && !RENTAL_SIGNAL_RE.test(text)) {
    score += 2;
    reasons.push('no rental-related content');
  }

  const exclamations = (text.match(/!/g) ?? []).length;
  const letterChars = text.match(/\p{L}/gu) ?? [];
  const upperChars = text.match(/\p{Lu}/gu) ?? [];
  if (
    exclamations > 5 ||
    (text.length > 40 && letterChars.length > 10 && upperChars.length / letterChars.length > 0.3)
  ) {
    score += 2;
    reasons.push('excessive emphasis');
  }

  if (score >= SUSPICION_THRESHOLD) {
    return { suspicious: true, reason: reasons.join(' + ') };
  }
  return { suspicious: false, reason: null };
}
