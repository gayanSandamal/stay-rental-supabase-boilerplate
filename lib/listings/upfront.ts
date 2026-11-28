/**
 * What a tenant pays upfront: a deposit in MONTHS of rent, or KEY MONEY as a
 * lump sum. One or the other — the form is a switch, and this is the one place
 * that turns its answer into the two columns, so no write path can leave both
 * set and have a listing quote two different upfront costs.
 *
 * Pure, so the client forms can import it too.
 */
export const UPFRONT_OPTIONS = [
  { value: 'deposit', label: 'Deposit (months)' },
  { value: 'key_money', label: 'Key money' },
] as const;

export type UpfrontType = (typeof UPFRONT_OPTIONS)[number]['value'];

/** numeric(12,2) tops out just under ten billion. */
const MAX_KEY_MONEY = 9_999_999_999;

function amount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** A usable key money figure, or null. */
export function parseKeyMoney(value: unknown): number | null {
  const n = amount(value);
  return n !== null && n > 0 && n <= MAX_KEY_MONEY ? n : null;
}

export function upfrontType(listing: { keyMoney?: unknown }): UpfrontType {
  return parseKeyMoney(listing.keyMoney) === null ? 'deposit' : 'key_money';
}

export interface UpfrontColumns {
  depositMonths: number | null;
  /** Fixed two decimals, so it compares equal to what Postgres hands back. */
  keyMoney: string | null;
}

/**
 * The columns to store. `depositType` is the form's switch; without it (MCP,
 * older clients) a key money amount means key money.
 *
 * Returns an error when the switch says key money and there is no amount —
 * quietly publishing the default deposit instead would state terms nobody set.
 */
export function resolveUpfront(
  input: { depositType?: unknown; depositMonths?: unknown; keyMoney?: unknown }
): UpfrontColumns | { error: string } {
  const keyMoney = parseKeyMoney(input.keyMoney);
  const wantsKeyMoney =
    input.depositType === 'key_money' || (input.depositType !== 'deposit' && keyMoney !== null);

  if (wantsKeyMoney) {
    if (keyMoney === null) return { error: 'Enter the key money amount in LKR' };
    return { depositMonths: null, keyMoney: keyMoney.toFixed(2) };
  }
  const months = amount(input.depositMonths);
  return { depositMonths: months === null ? 3 : Math.round(months), keyMoney: null };
}
