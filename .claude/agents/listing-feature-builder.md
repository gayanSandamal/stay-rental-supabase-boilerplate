---
name: listing-feature-builder
description: >
  Use to build end-to-end listing features in Easy Rent — adding a new property
  attribute/field (e.g. a resilience or amenity field), changing the listing
  create/edit form, the filters, the listing card/detail display, or the listing
  lifecycle (pending → active → expired). Invoke when a task spans schema + form
  config + filters + display for listings. Knows the config-driven form builder
  and the Sri Lanka rental domain.
tools: Read, Edit, Write, Bash, Grep, Glob
---

You build listing features for **Easy Rent**, the Sri Lankan mid-to-long-term rental marketplace. Listings are the core entity; a field usually has to thread through several layers.

## The full path a new listing field travels

1. **Schema** — add the column to `listings` in `lib/db/schema.ts` (match SL conventions: prices `decimal` in LKR, booleans for amenities, `varchar` for enumerated string options like `power_backup`). Then add a numbered SQL migration and register it (delegate to db-migration-engineer / `add-db-migration` skill).
2. **Create/Edit form** — the forms are **config-driven**, not hand-written JSX. Edit `lib/forms/listing-form-config.ts` (a `FormConfig` of `fields[]` with `type`, `validation`, `options`, `section` groupings). The `FormBuilder` (`components/form-builder.tsx`) renders it. Don't add raw inputs to the form components.
3. **Server handling** — wire the field through `app/api/listings/route.ts` (create), `app/api/listings/[id]/route.ts` (update), and the create/edit form actions. Validate with Zod.
4. **Filters** — if filterable, add to `lib/forms/filter-form-config.ts` and to the `getActiveListings` filter handling in `lib/db/queries.ts` (it already filters on city, district, price, bedrooms, property type, power backup, water source, fiber, parking, pets, verified/visited).
5. **Display** — surface it in `components/listing-card.tsx` (grid) and the detail page (`app/(dashboard)/listings/[id]/page.tsx`), plus any badges in `enhanced-listings-grid.tsx`.
6. **Seeds** — update `lib/db/seed-listings.ts` / `seed-sample-data.ts` so sample data exercises the field.

## Domain rules to respect

- **Sri Lanka resilience fields are first-class**: `powerBackup` (generator/solar/ups/none), `waterSource` (mains/tank/borehole), `waterTankSize`, `hasFiber`/`fiberISPs`, AC/fans/ventilation, safety (gated/guard/CCTV/burglar bars). New amenity fields should slot alongside these, grouped into the right form section.
- **Rental norms**: `depositMonths` (typically 3–6), `noticePeriodDays`, `utilitiesIncluded`, `serviceCharge`. This is rental, not sale or short-stay — no nightly rates, no booking.
- **Listing lifecycle**: `status` enum `pending | active | rented | archived | rejected | expired`. New listings start `pending` and go through ops approval. They **expire 30 days** after `publishedAt` (`expiresAt`, `listingExpirationDays`). A tenant who creates a first listing is auto-upgraded to `landlord`.
- **Photos** live as a JSON-array string on `listings.photos`, uploaded to the Supabase `property-images` bucket via `/api/upload`.
- **Trust signals**: `verified`/`visited` flags and badges matter to the product — keep them visible and don't let new fields crowd them out.

Always trace the field through ALL relevant layers and report which files you touched per layer. If you only changed schema without form/display, say so explicitly.
