/**
 * When a landlord's next performance report is due, and what window it covers.
 *
 * The job runs ONCE A DAY and decides per landlord, rather than running a
 * weekly cron and a daily cron. Two crons would need two schedules, two
 * batching limits and two sets of failure modes, and a landlord switching
 * frequency mid-week would either get two reports or none.
 */

export const REPORT_FREQUENCIES = ['off', 'weekly', 'daily'] as const;
export type ReportFrequency = (typeof REPORT_FREQUENCIES)[number];

export function isReportFrequency(value: unknown): value is ReportFrequency {
  return typeof value === 'string' && (REPORT_FREQUENCIES as readonly string[]).includes(value);
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * How stale `reportLastPeriodEnd` must be before the next report is due.
 *
 * These are deliberately SHORT of the nominal interval. The cron fires at a
 * fixed UTC minute, so each run stamps `reportLastPeriodEnd` a few seconds
 * later than the last one did. Compared against a strict 24h/7d threshold that
 * drift is always in the wrong direction — the row is 23h59m58s old, the run
 * skips it, and the landlord gets their "daily" report every OTHER day. The
 * slack absorbs the drift; it can never cause a double send, because the daily
 * cadence of the job itself is the real ceiling.
 */
const DUE_AFTER_MS: Record<Exclude<ReportFrequency, 'off'>, number> = {
  daily: 20 * HOUR,
  weekly: 6 * DAY + 12 * HOUR,
};

/**
 * The window a FIRST report covers, when there is no previous period to
 * continue from.
 *
 * Without this, a landlord who has been on the platform for four months and
 * only just switched reports on would be told "1,240 views" under a heading
 * that says "the last 7 days". The number would be true and the sentence would
 * be a lie, and a first impression that misreports is worse than no report.
 */
const FIRST_REPORT_LOOKBACK_MS: Record<Exclude<ReportFrequency, 'off'>, number> = {
  daily: 1 * DAY,
  weekly: 7 * DAY,
};

/**
 * The furthest back a report may reach to cover MISSED runs — deliberately
 * separate from, and far longer than, the first-report lookback.
 *
 * Conflating the two silently breaks the gap-fill this module exists for: with
 * a single 1-day cap, a daily landlord whose Tuesday send failed gets Wednesday
 * covering only Wednesday, and Tuesday's views are dropped on the floor while
 * the code looks like it recovers. Four nominal intervals absorbs any realistic
 * outage; past that, the missed days are genuinely stale and the label says so
 * rather than pretending the window was normal.
 */
const MAX_RECOVERY_MS: Record<Exclude<ReportFrequency, 'off'>, number> = {
  daily: 4 * DAY,
  weekly: 28 * DAY,
};

export interface ReportPeriod {
  /** Exclusive lower bound of the period being reported on. */
  start: Date;
  /** Inclusive upper bound — always "now" at the moment the job runs. */
  end: Date;
  /** Same-length window immediately before `start`, for the trend comparison. */
  previousStart: Date;
  /** "the last 7 days" / "yesterday" — reader-facing, never parsed. */
  label: string;
}

export function isReportDue(
  frequency: ReportFrequency,
  lastPeriodEnd: Date | null | undefined,
  now: Date = new Date()
): boolean {
  if (frequency === 'off') return false;
  // Never reported: due immediately. The lookback cap above is what stops that
  // first report from covering the landlord's entire history.
  if (!lastPeriodEnd) return true;
  return now.getTime() - lastPeriodEnd.getTime() >= DUE_AFTER_MS[frequency];
}

/**
 * The window to report on: everything since the last report, up to now.
 *
 * Deriving `start` from the last period's END — rather than from `now` minus a
 * fixed interval — is what makes a missed run self-healing. If Friday's send
 * failed, Saturday's report covers both days instead of silently dropping
 * Friday's views on the floor. The cap keeps a long outage from producing a
 * "weekly" report covering a month.
 */
export function reportPeriodFor(
  frequency: Exclude<ReportFrequency, 'off'>,
  lastPeriodEnd: Date | null | undefined,
  now: Date = new Date()
): ReportPeriod {
  // No previous period: this is a first report, and the shorter cap applies so
  // the number matches the heading. Otherwise continue from where the last
  // report stopped, reaching back at most MAX_RECOVERY_MS.
  const cap = lastPeriodEnd ? MAX_RECOVERY_MS[frequency] : FIRST_REPORT_LOOKBACK_MS[frequency];
  const earliest = new Date(now.getTime() - cap);
  const start = lastPeriodEnd && lastPeriodEnd > earliest ? lastPeriodEnd : earliest;

  const spanMs = Math.max(now.getTime() - start.getTime(), HOUR);
  return {
    start,
    end: now,
    previousStart: new Date(start.getTime() - spanMs),
    label: periodLabel(frequency, spanMs),
  };
}

/**
 * Honest about what the window actually was. A recovered run covering 2 days
 * says "the last 2 days", not "yesterday" — the number in the message has to
 * match the sentence around it.
 */
function periodLabel(frequency: Exclude<ReportFrequency, 'off'>, spanMs: number): string {
  const days = Math.round(spanMs / DAY);
  if (frequency === 'daily') return days <= 1 ? 'the last 24 hours' : `the last ${days} days`;
  if (days <= 1) return 'the last 24 hours';
  if (days >= 6 && days <= 8) return 'the last 7 days';
  return `the last ${days} days`;
}
