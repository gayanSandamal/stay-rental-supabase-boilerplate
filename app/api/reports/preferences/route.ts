import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser, getUserWithLandlord } from '@/lib/db/queries';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { whatsappTemplateName } from '@/lib/intake/channels/whatsapp/send';
import { isIntakeConfigured } from '@/lib/intake/channels/whatsapp/config';
import { REPORT_FREQUENCIES } from '@/lib/reports/period';
import { canChooseDaily, effectiveReportFrequency, setReportFrequency } from '@/lib/reports/prefs';

/**
 * A landlord's own scheduled-report settings.
 *
 * Landlord-scoped, not admin-scoped: this is the one report control a landlord
 * owns outright, so it is gated on "do you have a landlord row", never on plan
 * tier. The PAID part of the feature is which cadences are selectable, and that
 * distinction is enforced in `lib/reports/prefs.ts` — not here, and not by
 * hiding the endpoint.
 */

const patchSchema = z.object({
  frequency: z.enum(REPORT_FREQUENCIES),
});

/**
 * Everything the settings card needs to render honestly — including the two
 * ways this feature can be switched on but unable to deliver. A card that says
 * "weekly report on" while no template is approved is a promise the platform
 * cannot keep, so the state is reported rather than assumed.
 */
async function describe(userId: number) {
  const userWithLandlord = await getUserWithLandlord(userId);
  const landlord = userWithLandlord?.landlord;
  if (!landlord) return null;

  return {
    frequency: effectiveReportFrequency(landlord),
    storedFrequency: landlord.reportFrequency ?? 'weekly',
    canChooseDaily: canChooseDaily(landlord),
    // Only a verified WhatsApp identity can receive one. `users.phone` is
    // user-typed and unverified and must never be messaged.
    hasWhatsApp: Boolean(userWithLandlord?.waPhone),
    enabled: isFeatureEnabled('enableLandlordReports'),
    deliverable: isIntakeConfigured() && Boolean(whatsappTemplateName('report')),
    lastSentAt: landlord.reportLastSentAt,
  };
}

export async function GET(_request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await loadFeatureFlags();
    const prefs = await describe(user.id);
    if (!prefs) {
      return NextResponse.json({ error: 'No landlord profile' }, { status: 404 });
    }
    return NextResponse.json(prefs);
  } catch (error: unknown) {
    console.error('[api/reports/preferences] GET', error);
    return NextResponse.json({ error: 'Failed to load report settings' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: `frequency must be one of: ${REPORT_FREQUENCIES.join(', ')}` },
        { status: 400 }
      );
    }

    const userWithLandlord = await getUserWithLandlord(user.id);
    const landlord = userWithLandlord?.landlord;
    if (!landlord) {
      return NextResponse.json({ error: 'No landlord profile' }, { status: 404 });
    }

    // 'daily' from a free landlord is STORED, not rejected. They are told it
    // applies on a paid plan, and discarding the intent would silently lose it
    // the moment they upgrade — `effectiveReportFrequency` is what keeps the
    // actual sending honest in the meantime. See lib/reports/prefs.ts.
    await setReportFrequency(landlord.id, parsed.data.frequency, {
      actorUserId: user.id,
      source: 'dashboard',
    });

    await loadFeatureFlags();
    return NextResponse.json(await describe(user.id));
  } catch (error: unknown) {
    console.error('[api/reports/preferences] PATCH', error);
    return NextResponse.json({ error: 'Failed to save report settings' }, { status: 500 });
  }
}
