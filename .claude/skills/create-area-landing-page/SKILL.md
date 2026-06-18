---
name: create-area-landing-page
description: >
  Create an SEO-optimized location/area landing page for Easy Rent (e.g.
  "Houses for rent in Colombo / Kandy / Negombo / Galle / Jaffna"). Use when the
  task is "add an area page", "location landing page", "rank for <city> rentals",
  or supply/demand SEO growth for a Sri Lankan city or district. Aligned to the
  marketing strategy's priority areas.
---

# Create an area landing page

Area pages are a core SEO + acquisition lever in the growth strategy (priority cities: Colombo, Kandy, Negombo, Galle, Jaffna). Each is a public, indexable page that lists active rentals for one location and ranks for "[property type] for rent in [city]" queries.

## Recipe

1. **Route** — create a public page, e.g. `app/(dashboard)/rentals/[city]/page.tsx` (or a static set under `app/(dashboard)/rentals/colombo/page.tsx`). Keep it inside the public, no-auth area; do NOT put it behind `/dashboard`.

2. **Data** — query active listings for the location:
   ```ts
   import { getActiveListings } from '@/lib/db/queries';
   const listings = await getActiveListings({ city }); // also supports district, price, beds, type
   ```
   Reuse `components/listings-grid.tsx` / `enhanced-listings-grid.tsx` for rendering so paid-visibility ranking (Featured → Boost → Urgent → …) is preserved.

3. **Metadata** — export `generateMetadata` with a unique, localized title + description using helpers in `lib/seo.ts`:
   - Title: `Houses & Apartments for Rent in {City}, Sri Lanka | Easy Rent`
   - Description: mention verified, mid-to-long-term, direct contact, count of live listings.
   - Set canonical URL; OG/Twitter cards (reuse `app/opengraph-image.tsx` pattern).

4. **Structured data** — emit JSON-LD `ItemList` of `RealEstateListing`/`Product` entries (price in **LKR**, address/locality = the city, bedrooms). This drives rich results.

5. **On-page SEO & copy** — one `<h1>` ("Rent in {City}"), a short localized intro reinforcing **free to list + verified + direct phone/WhatsApp contact**, internal links to other area pages and to `/list-your-property`, and clear CTAs (Browse / List free). Keep claims honest (no booking/messaging features that don't exist).

6. **Sitemap & robots** — add the page(s) to `app/sitemap.ts`. Confirm `app/robots.ts` allows them (and still disallows `/dashboard`, `/back-office`, `/api`, auth pages).

7. **Empty state** — if a city has no live listings, show a helpful empty state + "List your property free here" CTA rather than a blank page (avoids thin/soft-404 content).

## Done checklist
- [ ] Public, indexable route (not under /dashboard)
- [ ] Uses `getActiveListings({ city })` + shared grid (ranking preserved)
- [ ] Unique localized metadata + canonical + OG
- [ ] JSON-LD `ItemList`/`RealEstateListing` with LKR prices
- [ ] Added to `sitemap.ts`; allowed by `robots.ts`
- [ ] Honest copy matching the product + good empty state
