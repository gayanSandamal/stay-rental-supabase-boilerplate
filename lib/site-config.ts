/**
 * Site-wide contact configuration.
 *
 * The WhatsApp support number powers the "concierge listing" funnel
 * ("WhatsApp us 6 photos — we list it for you"). It is intentionally an
 * env var (NEXT_PUBLIC_WHATSAPP_SUPPORT) rather than a DB setting: the value
 * must render in both server and client components, changes ~never, and can
 * be overridden per environment in Vercel.
 *
 * There is deliberately NO fallback number — when the var is unset every
 * concierge CTA hides itself, so we never route real landlords to a
 * placeholder.
 */

/** Digits-only WhatsApp support number (e.g. "94771234567"), or null when unconfigured. */
export function getWhatsAppSupportNumber(): string | null {
  const raw = process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT;
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 9 ? digits : null;
}

const CONCIERGE_MESSAGE =
  "Hi Easy Rent! I want to list my property. I'll send 6 photos and the address.";

/**
 * wa.me deep link with the prefilled concierge message.
 * `source` adds a short suffix (e.g. "from the listings page") for
 * zero-infrastructure attribution of which CTA converts.
 */
export function getConciergeWhatsAppLink(source?: string): string | null {
  const number = getWhatsAppSupportNumber();
  if (!number) return null;
  const text = source ? `${CONCIERGE_MESSAGE} (${source})` : CONCIERGE_MESSAGE;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/** "+94 77 123 4567"-style display form of the configured number. */
export function formatWhatsAppDisplay(): string | null {
  const number = getWhatsAppSupportNumber();
  if (!number) return null;
  // 94771234567 → +94 77 123 4567 (best-effort grouping for LK numbers)
  const m = number.match(/^(\d{2})(\d{2})(\d{3})(\d{4})$/);
  return m ? `+${m[1]} ${m[2]} ${m[3]} ${m[4]}` : `+${number}`;
}
