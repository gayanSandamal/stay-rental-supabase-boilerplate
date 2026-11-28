# Back-office reports: plan

Where they live: **Back Office → Reports** (`/back-office/reports`), admin and ops
only, behind `enableDataExport`. Each report has a screen with filters and a CSV
download named `<report>_<date>_<time>.csv` in Sri Lankan time. Every download is
written to the audit log as `data_exported`.

Adding one takes a single file: write a `ReportDefinition` (see
`lib/back-office/reports/import-follow-up.ts`) and list it in
`lib/back-office/reports/index.ts`. The screen, download, file name and audit
entry come with it.

## Built

| Report | Answers |
| --- | --- |
| Facebook import follow-up | Which imported owners need a call, at what number, about which post? |
| Expiring and expired listings | Which listings end in the next 14 days or ended in the last 30, with the owner's number? |
| Listings with no response | Which listings live 14+ days get no calls or WhatsApp taps, or under 10 viewers? |
| Incomplete listings | Which listings lack photos, a description, a type or a contact number? |

## Proposed, in build order

All of these use data that already exists. Nothing needs a migration.

| # | Report | Answers | What someone does with it | Source |
| --- | --- | --- | --- | --- |
| 1 | **Visibility sales** | Which Boost, Featured, Urgent and bundles are running, when do they end, what was activated this month? | Renewal calls; match to bank slips | `listings` visibility columns, `audit_logs` |
| 2 | **Owners and brokers** | Who has how many listings, on which plan, with what numbers? | Broker account management; plan upsell | `users`, `landlords`, `business_accounts` |
| 3 | **Unmet demand** | What do renters search for and find little of, by town, rent and bedrooms? | Choose which Facebook groups to import from | `search_queries`, `saved_searches` |
| 4 | **WhatsApp intake follow-up** | Which senders stalled part-way, and what did we last ask? | Finish the listing by phone | `whatsapp_intakes` |
| 5 | **Moderation queue** | What was held or rejected, why, and how long did it wait? | Clear the backlog; spot bad rules | `listing_moderations` |
| 6 | **Social performance** | What was posted where, with what views? Unknown stays blank, never 0 | Decide what to post; show owners their reach | `listing_social_posts` |
| 7 | **Team activity** | Imports, publishes, approvals and activations per person | Workload and quality | `audit_logs`, `post_imports.imported_by` |
| 8 | **Market rents** | Median rent by town and bedrooms, with sample size | Price advice, press, marketing | `market_rent_snapshots` (silent below the sample floor) |

## Rules for every report

- A statistic without the sample size for it is not printed
  (`lib/analytics/comparables.ts`). Unknown is blank, not zero.
- Never list an owner who declined, or prompt a second consent message.
- Synthetic `@wa.easyrent.lk` addresses are never exported. Use
  `publisherDisplayName()`.
- One query per report where possible, never `Promise.all`: the pool is `max: 1`.

## Later, if wanted

- "Followed up" marks with a note and date, so two people do not call the same
  owner. This needs a small table, and is the most useful next step once the
  first report is in daily use.
- A daily or weekly summary emailed to ops.
