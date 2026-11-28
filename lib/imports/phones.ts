/**
 * The numbers on an import, beyond the owner's own.
 *
 * Sri Lankan adverts routinely print two or three ("070 125 6170 / 072 438
 * 1763"), and which of them is on WhatsApp is something only the operator
 * reading the advert can say. `post_imports.owner_phone` stays the one we ASK
 * for consent; these are only ever published as contact numbers.
 *
 * Pure and client-safe: the normaliser lives in a server module (it pulls in
 * the database), so it is passed in.
 */
export interface ImportPhone {
  phone: string;
  isWhatsApp: boolean;
}

export const MAX_EXTRA_PHONES = 4;

const E164 = /^\+\d{8,15}$/;

export function isPublishablePhone(phone: string): boolean {
  return E164.test(phone);
}

/** Stored JSON → rows. Anything malformed is dropped rather than thrown on. */
export function parseExtraPhones(raw: string | null | undefined): ImportPhone[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter((v): v is ImportPhone => !!v && typeof v === 'object' && typeof v.phone === 'string')
      .map((v) => ({ phone: v.phone, isWhatsApp: v.isWhatsApp === true }));
  } catch {
    return [];
  }
}

/**
 * Clean what the operator entered: normalised, deduplicated, and never the
 * owner's number a second time.
 *
 * A number we cannot read is KEPT AS TYPED, not dropped. Saving a draft must
 * not eat someone's typing; `unreadablePhones` is what stops it publishing.
 */
export function cleanExtraPhones(
  rows: ImportPhone[],
  ownerPhone: string | null,
  normalize: (raw: string) => string | null
): ImportPhone[] {
  const seen = new Set(ownerPhone ? [ownerPhone] : []);
  const out: ImportPhone[] = [];
  for (const row of rows) {
    const typed = row.phone.trim().slice(0, 30);
    if (!typed) continue;
    const phone = normalize(typed) ?? typed;
    if (seen.has(phone)) continue;
    seen.add(phone);
    out.push({ phone, isWhatsApp: row.isWhatsApp });
  }
  return out.slice(0, MAX_EXTRA_PHONES);
}

export function unreadablePhones(rows: ImportPhone[]): string[] {
  return rows.map((r) => r.phone).filter((p) => !isPublishablePhone(p));
}

export function serializeExtraPhones(rows: ImportPhone[]): string | null {
  return rows.length ? JSON.stringify(rows) : null;
}
