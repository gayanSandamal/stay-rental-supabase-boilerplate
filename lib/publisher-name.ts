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
  // Never fall back to the email, real or synthetic (2026-11-28). A synthetic
  // `@wa.easyrent.lk` address is a phone-number-shaped identifier, and a real
  // one put a landlord's personal Gmail on a public listing page (listing 48),
  // where anyone could scrape it. Not even the local part: "ravindu1234" is
  // just as identifying. `input.email` stays in the signature so callers that
  // pass a whole user row keep compiling.
  return 'Property owner';
}
