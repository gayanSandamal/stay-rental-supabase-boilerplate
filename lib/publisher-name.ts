import { isReservedWaEmail } from '@/lib/intake/landlord-identity';

/**
 * What to show as the publisher of a listing.
 *
 * Five surfaces render `user.name || user.email`, which means a landlord with
 * no name has their real email address printed on a public page — and once
 * WhatsApp landlords exist, it would print a synthetic
 * `wa-<hash>@wa.easyrent.lk` address too. Always route publisher display
 * through here.
 */
export function publisherDisplayName(input: {
  name?: string | null;
  email?: string | null;
}): string {
  const name = input.name?.trim();
  if (name) return name;
  // A synthetic address is a phone-number-shaped identifier: never render it.
  if (isReservedWaEmail(input.email)) return 'Property owner';
  // NOTE: a real email still falls through, preserving today's behaviour. That
  // is a pre-existing privacy smell (a nameless landlord's address appears on a
  // public page) — deliberately not changed here, since it affects existing
  // listings and is a separate product decision.
  return input.email?.trim() || 'Property owner';
}
