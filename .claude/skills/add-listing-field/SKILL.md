---
name: add-listing-field
description: >
  Add a new property attribute/field to Easy Rent listings end-to-end — schema,
  migration, the config-driven create/edit form, optional filter, listing
  card/detail display, and seeds. Use whenever the task is "add a field to
  listings", "let landlords specify X", or "make listings filterable by X".
  Knows the Sri Lanka rental domain and the form builder.
---

# Add a listing field (end-to-end)

A listing field usually threads through six layers. Don't stop at schema.

## 1. Schema + migration
- Add the column to the `listings` table in `lib/db/schema.ts`. Conventions: `boolean(...).default(false)` for amenities, `varchar(... , {length})` for enumerated string options (e.g. `power_backup`), `integer(...)` for counts/sizes, `decimal(..., {precision, scale})` for LKR money.
- Add + register a numbered SQL migration — use the **`add-db-migration`** skill.

## 2. Create/Edit form (config-driven — NOT hand-written JSX)
- Edit `lib/forms/listing-form-config.ts`. Add a field object to `fields[]`:
  ```ts
  {
    name: 'hasSolarHotWater',
    label: 'Solar Hot Water',
    type: 'checkbox',            // text | textarea | number | select | checkbox | section | ...
    helpText: 'Tick if the property has solar hot water',
  }
  ```
  Group it under the right `type: 'section'` (Basic Info, Property Details, Pricing, Resilience, Safety, etc.). `FormBuilder` (`components/form-builder.tsx`) renders the config — never add raw `<input>`s to form components.

## 3. Server handling
- Wire create (`app/api/listings/route.ts`) and update (`app/api/listings/[id]/route.ts`) to read/persist the field; validate with Zod. Check the create/edit form actions and `create-listing-form` / `edit-listing-form`.

## 4. Filter (optional)
- If filterable: add to `lib/forms/filter-form-config.ts` AND to the filter handling in `getActiveListings` (`lib/db/queries.ts`), following the existing pattern for `powerBackup`, `waterSource`, `hasFiber`, `parking`, `petsAllowed`, etc.

## 5. Display
- Show it on `components/listing-card.tsx` (grid) and the detail page (`app/(dashboard)/listings/[id]/page.tsx`). Add a badge in `enhanced-listings-grid.tsx` if it's a highlight. Keep `verified`/`visited` trust badges prominent.

## 6. Seeds
- Update `lib/db/seed-listings.ts` / `seed-sample-data.ts` so sample listings populate the field.

## Sri Lanka domain notes
- Resilience fields are first-class: power (generator/solar/ups/none), water (mains/tank/borehole + tank size), fiber + ISPs, AC/fans/ventilation, safety (gated/guard/CCTV/burglar bars).
- Rental, not sale/short-stay: deposits in **months** (`depositMonths` 3–6), `noticePeriodDays`, `utilitiesIncluded`, `serviceCharge`, monthly rent in **LKR**. No nightly pricing.

## Done checklist
- [ ] schema + registered migration
- [ ] field added to `listing-form-config.ts`
- [ ] create + update routes persist & validate it
- [ ] filter added (if filterable) in config + `getActiveListings`
- [ ] shown on card + detail
- [ ] seeds updated
