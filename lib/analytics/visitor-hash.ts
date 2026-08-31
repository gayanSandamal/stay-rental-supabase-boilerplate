import { createHash } from 'node:crypto';

/**
 * A daily, salted visitor hash for view deduplication.
 *
 *     sha256( ip + user-agent + VIEW_HASH_SALT + yyyy-mm-dd )
 *
 * The DATE COMPONENT is the whole design. It is what makes this
 * privacy-preserving — the hash rotates at midnight, so nothing here can follow
 * a person from one day to the next — and it is also what makes the number
 * meaningful: "unique viewers this week" reads as "unique per day, summed",
 * which is the honest claim for data collected without identity.
 *
 * The salt stops someone holding a copy of `listing_views` from confirming
 * whether a known IP + user-agent viewed a given listing; the input space is
 * small enough to brute-force otherwise. Set VIEW_HASH_SALT in the environment
 * — never in a NEXT_PUBLIC_* variable, which ships the salt to the browser and
 * defeats the point.
 *
 * The salt must be STABLE across instances and deploys. A per-process random
 * value would look like it worked and would silently multiply every unique
 * count by the number of running instances, so an unset salt degrades to an
 * empty string (weaker, still correct) rather than to randomness.
 */

let warned = false;

function salt(): string {
  const configured = process.env.VIEW_HASH_SALT;
  if (configured) return configured;
  if (!warned) {
    warned = true;
    console.warn(
      '[visitor-hash] VIEW_HASH_SALT is not set — view visitor hashes are unsalted. ' +
        'Unique-viewer counts stay correct; the hashes are just weaker against ' +
        'an offline guess of (ip, user-agent).'
    );
  }
  return '';
}

/** UTC calendar day, so every instance agrees on when the hash rotates. */
export function visitorDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function visitorHash(
  ip: string,
  userAgent: string | null,
  now: Date = new Date()
): string {
  return createHash('sha256')
    .update(`${ip}|${userAgent ?? ''}|${salt()}|${visitorDayKey(now)}`)
    .digest('hex');
}
