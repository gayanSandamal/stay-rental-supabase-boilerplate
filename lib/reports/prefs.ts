/**
 * Who may choose which report cadence, and how a choice is recorded.
 *
 * DAILY IS THE PAID FEATURE, weekly is for everyone. That split is deliberate
 * and matches the monetization model: the platform never withholds supply-side
 * basics (see LISTING_LIMITS), it charges for *more* of a good thing. A free
 * landlord who stops hearing from us stops listing with us, so the weekly
 * report is a retention cost, not a product tier.
 *
 * THE GATE IS EVALUATED AT SEND TIME, NOT AT WRITE TIME. A landlord on Pro sets
 * 'daily', their plan lapses two months later, and the stored value is still
 * 'daily'. Reading the raw column would keep sending — and every one of those
 * sends is a billable WhatsApp template. `effectiveReportFrequency` re-checks
 * the live tier on every run, so a lapsed plan silently falls back to weekly
 * and the landlord's stored preference is preserved for when they renew.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { landlords } from '@/lib/db/schema';
import { logAudit } from '@/lib/db/audit-logger';
import { getLandlordPlanTier, type LandlordWithPlan } from '@/lib/landlord-plans';
import { isReportFrequency, type ReportFrequency } from './period';

/** Tiers that may receive a daily report. Free is every other tier, present or future. */
export function canChooseDaily(landlord: LandlordWithPlan | null | undefined): boolean {
  return getLandlordPlanTier(landlord) !== 'free';
}

/**
 * The cadence to actually send at — the stored preference, clamped to what the
 * landlord's CURRENT plan allows. 'off' is always honoured: an opt-out is never
 * something a plan change may override.
 */
export function effectiveReportFrequency(
  landlord: (LandlordWithPlan & { reportFrequency?: string | null }) | null | undefined
): ReportFrequency {
  if (!landlord) return 'off';
  const stored = landlord.reportFrequency;
  const frequency: ReportFrequency = isReportFrequency(stored) ? stored : 'weekly';
  if (frequency === 'off') return 'off';
  if (frequency === 'daily' && !canChooseDaily(landlord)) return 'weekly';
  return frequency;
}

/**
 * Persist a landlord's choice.
 *
 * Storing 'daily' for a free landlord is allowed on purpose — they are told it
 * takes effect on a paid plan, and clamping the write would lose the intent the
 * moment they upgrade. `effectiveReportFrequency` is the thing that keeps it
 * honest in the meantime.
 *
 * `actorUserId` is the user who made the change: the landlord themselves from
 * the dashboard, or NULL when it came from a WhatsApp STOP — an opt-out we
 * acted on has no signed-in actor, and recording a fake one would corrupt the
 * audit trail.
 */
export async function setReportFrequency(
  landlordId: number,
  frequency: ReportFrequency,
  opts: { actorUserId?: number | null; source: 'dashboard' | 'whatsapp' | 'ops' } = {
    source: 'dashboard',
  }
): Promise<void> {
  await db
    .update(landlords)
    .set({ reportFrequency: frequency, updatedAt: new Date() })
    .where(eq(landlords.id, landlordId));

  await logAudit({
    action: 'landlord_report_prefs_changed',
    entityType: 'landlord',
    entityId: landlordId,
    userId: opts.actorUserId ?? undefined,
    metadata: { frequency, source: opts.source },
  });
}
