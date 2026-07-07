import { db } from '@/lib/db/drizzle';
import { listings } from '@/lib/db/schema';
import { and, eq, ne } from 'drizzle-orm';
import type { ParsedIntake } from './parser';

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

  if (parsed.missingFields.length > 0) {
    return {
      ok: false,
      retriable: true,
      reason: `Missing: ${parsed.missingFields.join(', ')}`,
    };
  }

  if (parsed.rentPerMonth! < RENT_MIN || parsed.rentPerMonth! > RENT_MAX) {
    return {
      ok: false,
      retriable: true,
      reason: `Rent LKR ${parsed.rentPerMonth} outside plausible range`,
    };
  }

  // Duplicate screen — mirrors the API's duplicate detection.
  const dupe = await db.query.listings.findFirst({
    where: and(
      eq(listings.address, parsed.address!),
      eq(listings.city, parsed.city!),
      ne(listings.status, 'rejected')
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
