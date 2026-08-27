/**
 * URL segments a landlord may never claim as a custom profile slug.
 *
 * Landlord profiles live at the ROOT — `app/(dashboard)/[slug]/page.tsx` is a
 * catch-all, so every real top-level route competes with it. Next resolves a
 * static segment before a dynamic one, so a landlord who claims a real route
 * name does not hijack it; they get something arguably worse — a profile URL
 * that silently resolves to someone else's page, forever.
 *
 * That matters because the slug is **one-time and irreversible**
 * (`/api/landlords/me/profile-slug` rejects a second write with "can only be
 * set once"). There is no self-serve way back.
 *
 * This list previously existed TWICE, and the two copies disagreed:
 *
 *   - the WRITE path (the API route, which decides what can be claimed) was
 *     missing `how-to-use` — a real page — so it was claimable
 *   - the RENDER path (`[slug]/page.tsx`) was missing `api` and `me`
 *   - NEITHER covered `auth`, `l`, `link-expired`, or the file-based routes
 *     (`robots.txt`, `sitemap.xml`, `opengraph-image`)
 *
 * `l` is the WhatsApp landlord access-link route (`app/l/[...slug]`). Losing a
 * profile to it would be the worst case of the set, since that is the only way
 * a WhatsApp-intake landlord gets back into their account.
 *
 * Keep this in sync when adding a top-level route. `pnpm test` covers it:
 * `tests/unit/reserved-slugs.test.ts` walks the app directory and fails if a
 * real top-level segment is missing here.
 */
export const RESERVED_SLUGS = new Set([
  // Route directories under app/
  'api',
  'auth',
  'back-office',
  'dashboard',
  'forgot-password',
  'how-to-use',
  'l',
  'link-expired',
  'list-your-property',
  'listings',
  'privacy-policy',
  'reset-password',
  'sign-in',
  'sign-up',
  'terminal',
  'terms-of-service',

  // File-based routes that own a path
  'robots.txt',
  'sitemap.xml',
  'opengraph-image',
  'favicon.ico',
  'icon',
  'icon.png',
  'icon.svg',

  // Reserved for planned routes, so nobody claims them first. Area landing
  // pages will live under /rentals/<city>.
  'rentals',

  // Generic words that would read as platform pages rather than a landlord.
  'me',
  'admin',
  'support',
  'help',
  'about',
  'contact',
  'pricing',
  'search',
  'settings',
  'account',
  'login',
  'logout',
  'register',
  'new',
]);

/** True when `slug` collides with a platform route or a reserved word. */
export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.trim().toLowerCase());
}
