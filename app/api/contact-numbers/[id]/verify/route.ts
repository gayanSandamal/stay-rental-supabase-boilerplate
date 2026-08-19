import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { userContactNumbers, businessAccountMembers } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { mintPhoneVerification } from '@/lib/auth/phone-verification';
import { eq, and } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * Issue a WhatsApp verification challenge for one of the caller's contact
 * numbers, and hand back the wa.me deep link that prefills it.
 *
 * This route only MINTS. It never marks anything verified — that happens in the
 * intake webhook, when a message actually arrives from the number in question
 * (see lib/auth/phone-verification.ts). Keeping the two apart is the point: an
 * endpoint that could both issue and confirm would be a self-verification API.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Literal path, not the resolved one: the id must not shard the bucket, or
    // the limit would reset for every contact number an abuser cycles through.
    const rl = checkRateLimit(
      getClientIp(request),
      'POST',
      '/api/contact-numbers/[id]/verify'
    );
    if (!rl.allowed) return rateLimitResponse(rl.resetAt);

    // Flag rows override the defaults; without this the route would answer from
    // the compiled-in default and ignore the back-office toggle.
    await loadFeatureFlags();
    if (!isFeatureEnabled('enablePhoneVerification')) {
      return NextResponse.json({ error: 'Phone verification is disabled' }, { status: 409 });
    }
    // The challenge is redeemed by the intake webhook. With the pipeline off,
    // the landlord's message would be acked and dropped — so promise nothing.
    if (!isFeatureEnabled('enableWhatsAppIntake')) {
      return NextResponse.json(
        { error: 'WhatsApp verification is unavailable right now' },
        { status: 409 }
      );
    }

    const resolvedParams = params instanceof Promise ? await params : params;
    const contactNumberId = Number(resolvedParams.id);
    if (isNaN(contactNumberId) || contactNumberId <= 0) {
      return NextResponse.json({ error: 'Invalid contact number ID' }, { status: 400 });
    }

    const contactNumber = await db.query.userContactNumbers.findFirst({
      where: eq(userContactNumbers.id, contactNumberId),
    });
    if (!contactNumber) {
      return NextResponse.json({ error: 'Contact number not found' }, { status: 404 });
    }

    // Same ownership rule as PUT/DELETE on this resource: yours, or your
    // business account's.
    let hasAccess = false;
    if (contactNumber.userId === user.id) {
      hasAccess = true;
    } else if (contactNumber.businessAccountId) {
      const membership = await db.query.businessAccountMembers.findFirst({
        where: and(
          eq(businessAccountMembers.userId, user.id),
          eq(businessAccountMembers.businessAccountId, contactNumber.businessAccountId),
          eq(businessAccountMembers.isActive, true)
        ),
      });
      hasAccess = !!membership;
    }
    if (!hasAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    if (contactNumber.verified) {
      return NextResponse.json({ success: true, alreadyVerified: true }, { status: 200 });
    }

    const minted = await mintPhoneVerification({
      contactNumberId,
      userId: user.id,
      phoneNumber: contactNumber.phoneNumber,
    });

    if (!minted.ok) {
      return NextResponse.json(
        {
          error:
            minted.reason === 'unnormalizable'
              ? "We couldn't read that number. Please re-save it as 07X XXX XXXX or +94 7X XXX XXXX."
              : 'WhatsApp verification is not configured.',
        },
        { status: minted.reason === 'unnormalizable' ? 400 : 503 }
      );
    }

    // The code goes back to its own owner, who is about to send it themselves —
    // there is no confidentiality to protect here that the deep link doesn't
    // already give away. It is returned so the UI can show it as a fallback for
    // desktop users whose browser can't hand off to WhatsApp.
    return NextResponse.json(
      {
        success: true,
        code: minted.value.code,
        link: minted.value.link,
        expiresAt: minted.value.expiresAt.toISOString(),
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error minting phone verification:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to start verification' },
      { status: 500 }
    );
  }
}
