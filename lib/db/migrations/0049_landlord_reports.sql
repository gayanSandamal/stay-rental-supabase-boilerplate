-- Scheduled listing-performance reports over WhatsApp.
--
-- WHY THESE COLUMNS LIVE ON `landlords`, NOT ON `users`. The report is about a
-- portfolio, and a portfolio belongs to a landlord row. A tenant has nothing to
-- report on, and the tenant→landlord auto-upgrade creates the landlord row at
-- exactly the moment the first listing exists — which is the first moment a
-- report would have anything to say.
--
--   report_frequency   'off' | 'weekly' | 'daily'
--                      Default 'weekly' because the report is a retention
--                      mechanic, not an upsell: a landlord who never opens the
--                      dashboard is precisely the one it exists for. Daily is
--                      paid-tier only, enforced in code (lib/reports/prefs.ts),
--                      never here — a plan can lapse, and a lapsed plan must
--                      quietly fall back to weekly rather than leave a stale
--                      'daily' row sending 30 billable templates a month.
--
--   report_last_period_end
--                      The END of the last period actually REPORTED ON, not
--                      the wall-clock send time. This is what makes the job
--                      idempotent AND gap-free: the next run reports on
--                      (report_last_period_end, now]. A send that fails leaves
--                      it NULL/stale, so the following run covers the missed
--                      days instead of silently dropping them. A "sent_at"
--                      column could not do this — it cannot distinguish "sent
--                      Monday covering last week" from "sent Monday covering
--                      one day".
--
--   report_last_sent_at
--                      Purely observational: when a template last actually
--                      reached this landlord. Ops-facing, never a control.
--
-- Replay-safe: three IF NOT EXISTS column adds, one partial index, two
-- idempotent enum values. No DO block (see the splitStatements note in
-- CLAUDE.md). run-all-migrations.ts replays this file on every invocation.

ALTER TABLE landlords
  ADD COLUMN IF NOT EXISTS report_frequency varchar(10) NOT NULL DEFAULT 'weekly';

ALTER TABLE landlords
  ADD COLUMN IF NOT EXISTS report_last_period_end timestamp;

ALTER TABLE landlords
  ADD COLUMN IF NOT EXISTS report_last_sent_at timestamp;

-- The job scans "who is due", which is only ever the landlords who still want a
-- report. Partial, because 'off' rows are dead weight in that scan forever.
CREATE INDEX IF NOT EXISTS landlords_report_due_idx
  ON landlords (report_frequency, report_last_period_end)
  WHERE report_frequency <> 'off';

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'landlord_report_sent';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'landlord_report_prefs_changed';
