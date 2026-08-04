import { db } from '@/lib/db/drizzle';
import { listings } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import type { ParsedIntake } from '@/lib/intake/parser/types';

export interface CheckResult {
  ok: boolean;
  /** ok=false + retriable=true → ask the sender for more info (needs_info). */
  retriable: boolean;
  reason: string | null;
}

/** LKR sanity window for monthly rent (mid-to-long-term SL market). */
const RENT_MIN = 5_000;
const RENT_MAX = 3_000_000;

/**
 * Automated pre-publication checks. Deliberately conservative: anything that
 * fails a non-retriable check goes to manual_review — never silently dropped.
 */
export async function runIntakeChecks(parsed: ParsedIntake): Promise<CheckResult> {
  if (parsed.suspicious) {
    return {
      ok: false,
      retriable: false,
      reason: `Parser flagged content: ${parsed.suspicionReason ?? 'suspicious'}`,
    };
  }

  if (parsed.multiProperty) {
    return {
      ok: false,
      retriable: true,
      reason:
        'That looks like more than one property — please send each property as a separate message',
    };
  }

  if (parsed.missingFields.length > 0) {
    return {
      ok: false,
      retriable: true,
      reason: `Missing: ${parsed.missingFields.join(', ')}`,
    };
  }

  if (parsed.rentPerMonth! < RENT_MIN || parsed.rentPerMonth! > RENT_MAX) {
    // This string goes VERBATIM to the sender via needsInfoMessage — it must
    // read like a sentence and say what to do, not like a log line.
    return {
      ok: false,
      retriable: true,
      reason: `The monthly rent of LKR ${parsed.rentPerMonth!.toLocaleString('en-US')} looks unusual — rents on Easy Rent are between LKR 5,000 and LKR 3,000,000. Please reply with the correct monthly rent`,
    };
  }

  // Duplicate screen — mirrors the API's duplicate detection. Only live and
  // in-review listings count: relisting after expiry/rented/archive is the
  // normal lifecycle, not fraud.
  const dupe = await db.query.listings.findFirst({
    where: and(
      eq(listings.address, parsed.address!),
      eq(listings.city, parsed.city!),
      inArray(listings.status, ['active', 'pending'])
    ),
  });
  if (dupe) {
    return {
      ok: false,
      retriable: false,
      reason: `Possible duplicate of listing #${dupe.id} (same address+city)`,
    };
  }

  return { ok: true, retriable: false, reason: null };
}
