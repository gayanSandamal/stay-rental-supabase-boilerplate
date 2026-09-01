/**
 * Contact clicks — a tapped Call or WhatsApp button on a listing detail page.
 *
 * The channel is stored as text rather than a Postgres enum (matching the
 * `channel` convention on whatsapp_intakes), so this module is the only place
 * that decides what a valid channel is.
 */

export const CONTACT_CHANNELS = ['call', 'whatsapp'] as const;

export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export function isContactChannel(value: unknown): value is ContactChannel {
  return typeof value === 'string' && (CONTACT_CHANNELS as readonly string[]).includes(value);
}
