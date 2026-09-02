/**
 * Delivering scheduled performance reports.
 *
 * WHO CAN RECEIVE ONE. `users.wa_phone` and nothing else. It is the only
 * WhatsApp identity Meta has proven possession of; `users.phone` is typed by
 * the user and unverified, and messaging an unverified number is how a report
 * about someone's property reaches a stranger. That restriction is also why
 * this feature reaches WhatsApp-origin landlords first — dashboard-only
 * landlords have no verified number until they verify one.
 *
 * WHY A FAILED SEND STILL ADVANCES THE CLOCK. The obvious design leaves
 * `reportLastPeriodEnd` untouched on failure so the next run covers the gap.
 * That is right for a ledger and wrong for this: the job runs daily, so a
 * number that has left WhatsApp would be retried every single day, forever, and
 * sustained failed business-initiated sends are precisely what degrades a WABA
 * quality rating — which costs every OTHER landlord their messages. A report is
 * a snapshot, not a receipt. One skipped week is a small loss; the retry storm
 * is not. Failures are counted in the job's response and written to the audit
 * log so ops can see a number going bad instead of inferring it.
 */

import { and, eq, isNotNull, isNull, or, lte, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { landlords, listings, users } from '@/lib/db/schema';
import { logAudit } from '@/lib/db/audit-logger';
import { createNotification } from '@/lib/notifications';
import { isFeatureEnabled } from '@/lib/feature-flags';
import {
  sendWhatsAppTemplate,
  whatsappTemplateName,
} from '@/lib/intake/channels/whatsapp/send';
import { isIntakeConfigured } from '@/lib/intake/channels/whatsapp/config';
import { getLandlordReportData, getMarketAvgRent } from './data';
import {
  greetingName,
  renderReportText,
  reportNotificationTitle,
  reportTemplateParams,
} from './message';
import { effectiveReportFrequency } from './prefs';
import { isReportDue, reportPeriodFor } from './period';

/**
 * How many reports one invocation may SEND. Each send is a Graph round trip
 * with an 8s ceiling, and the whole job shares one serverless timeout, so this
 * is a wall-clock budget, not a politeness limit.
 */
export const REPORT_SEND_LIMIT = 60;

/**
 * How many candidate rows one invocation may CONSIDER.
 *
 * Larger than the send limit on purpose. The SQL filter uses each landlord's
 * STORED frequency, but the frequency actually sent at is the stored value
 * clamped to their current plan (`effectiveReportFrequency`) — a lapsed Pro
 * landlord still stored as 'daily' is selected every day and correctly rejected
 * in JS. Scanning a wider window than we send means those rejections cannot
 * crowd out landlords who really are due.
 */
const REPORT_SCAN_LIMIT = 400;

/** The loosest due threshold across all cadences (daily's 20h). See period.ts. */
const LOOSEST_DUE_MS = 20 * 60 * 60 * 1000;

export interface ReportRunResult {
  considered: number;
  /** Reports WhatsApp accepted. */
  sent: number;
  /**
   * Reports composed and logged but never delivered, because no approved
   * template is configured. Counted apart from `failed` on purpose: a run that
   * reports "failed: 40" when nothing is wrong except unfinished setup sends
   * ops looking for an outage that does not exist — the same lie as a row
   * reading `posted` for a post that was never made.
   */
  dryRun: number;
  /** Reports WhatsApp rejected. This one is worth waking up for. */
  failed: number;
  skipped: number;
  /** True when the send budget ran out — ops should widen the schedule. */
  saturated: boolean;
  /** No credentials or no approved template: nothing this run could deliver. */
  deliveryConfigured: boolean;
}

type Candidate = {
  /** The landlord row id — named `id` so it satisfies `LandlordWithPlan`. */
  id: number;
  userId: number;
  waPhone: string;
  name: string | null;
  reportFrequency: string | null;
  reportLastPeriodEnd: Date | null;
  landlordPlanTier: string | null;
  landlordPlanExpiresAt: Date | null;
};

/**
 * Landlords who might be due, oldest-waiting first so nobody starves behind a
 * full batch. `EXISTS (listings)` is in the query rather than in the loop
 * because a landlord with nothing listed has nothing to report on, and pulling
 * them in only to discard them would waste the scan window every single run.
 */
async function findCandidates(now: Date): Promise<Candidate[]> {
  return db
    .select({
      id: landlords.id,
      userId: users.id,
      waPhone: users.waPhone,
      name: users.name,
      reportFrequency: landlords.reportFrequency,
      reportLastPeriodEnd: landlords.reportLastPeriodEnd,
      landlordPlanTier: landlords.landlordPlanTier,
      landlordPlanExpiresAt: landlords.landlordPlanExpiresAt,
    })
    .from(landlords)
    .innerJoin(users, eq(landlords.userId, users.id))
    .where(
      and(
        ne(landlords.reportFrequency, 'off'),
        isNotNull(users.waPhone),
        isNull(users.deletedAt),
        or(
          isNull(landlords.reportLastPeriodEnd),
          lte(landlords.reportLastPeriodEnd, new Date(now.getTime() - LOOSEST_DUE_MS))
        ),
        sql`exists (select 1 from ${listings} where ${listings.landlordId} = ${landlords.id})`
      )
    )
    // Raw fragment, not `asc(...)`: drizzle appends the direction AFTER the
    // expression, so wrapping this would emit "... nulls first asc", which
    // Postgres rejects. NULLS FIRST is required — ASC defaults to NULLS LAST,
    // which would put landlords who have never had a report at the very BACK of
    // the queue, behind everyone who already gets one.
    .orderBy(sql`${landlords.reportLastPeriodEnd} asc nulls first`)
    .limit(REPORT_SCAN_LIMIT) as Promise<Candidate[]>;
}

/**
 * Build and deliver one landlord's report.
 *
 * Every await is sequential. On Vercel the pool is `max: 1` against a
 * transaction pooler, and concurrent queries on that connection wedge the whole
 * request (commit a3ac4f9) — a loop is the only safe shape here.
 */
async function sendOne(
  candidate: Candidate,
  now: Date
): Promise<'sent' | 'dryRun' | 'failed'> {
  const frequency = effectiveReportFrequency(candidate);
  const period = reportPeriodFor(frequency as 'weekly' | 'daily', candidate.reportLastPeriodEnd, now);

  const data = await getLandlordReportData(candidate.id, period, now);

  const marketAvgRent = data.topListing
    ? await getMarketAvgRent(data.topListing, now)
    : null;

  const params = reportTemplateParams({
    name: greetingName(candidate),
    data,
    period,
    marketAvgRent,
  });

  const templateName = whatsappTemplateName('report');
  let delivered = false;
  let attempted = false;

  if (templateName) {
    attempted = true;
    delivered = await sendWhatsAppTemplate(candidate.waPhone, {
      name: templateName,
      bodyParams: params,
    });
  } else {
    // No approved template registered yet: log what WOULD have gone out and
    // treat it as undelivered. Never fall back to free-form text — see
    // sendWhatsAppTemplate for why that cannot work outside the 24h window.
    console.log(
      `[reports:dryrun] to=${candidate.waPhone} (no WHATSAPP_REPORT_TEMPLATE)\n${renderReportText(params)}`
    );
  }

  // The in-app notification is written whether or not WhatsApp accepted the
  // message. It is the landlord's durable copy, and a Graph outage should not
  // erase the fact that the report was produced.
  await createNotification({
    userId: candidate.userId,
    type: 'performance_report',
    title: reportNotificationTitle(data, period),
    body: renderReportText(params),
    link: '/dashboard/analytics',
  });

  await db
    .update(landlords)
    .set({
      reportLastPeriodEnd: period.end,
      ...(delivered ? { reportLastSentAt: now } : {}),
      updatedAt: now,
    })
    .where(eq(landlords.id, candidate.id));

  await logAudit({
    action: 'landlord_report_sent',
    entityType: 'landlord',
    entityId: candidate.id,
    metadata: {
      frequency,
      delivered,
      periodStart: period.start.toISOString(),
      periodEnd: period.end.toISOString(),
      totalViews: data.totalViews,
      previousViews: data.previousViews,
      activeListings: data.activeListings,
    },
  });

  if (delivered) return 'sent';
  return attempted ? 'failed' : 'dryRun';
}

export async function runLandlordReports(now: Date = new Date()): Promise<ReportRunResult> {
  const result: ReportRunResult = {
    considered: 0,
    sent: 0,
    dryRun: 0,
    failed: 0,
    skipped: 0,
    saturated: false,
    deliveryConfigured: isIntakeConfigured() && Boolean(whatsappTemplateName('report')),
  };

  if (!isFeatureEnabled('enableLandlordReports')) return result;

  const candidates = await findCandidates(now);
  result.considered = candidates.length;

  for (const candidate of candidates) {
    if (result.sent + result.dryRun + result.failed >= REPORT_SEND_LIMIT) {
      result.saturated = true;
      break;
    }

    const frequency = effectiveReportFrequency(candidate);
    if (frequency === 'off' || !isReportDue(frequency, candidate.reportLastPeriodEnd, now)) {
      result.skipped++;
      continue;
    }

    try {
      const outcome = await sendOne(candidate, now);
      result[outcome]++;
    } catch (error) {
      // One landlord's bad row must never abandon the rest of the batch.
      console.error(`[reports] landlord ${candidate.id} failed`, error);
      result.failed++;
    }
  }

  return result;
}
