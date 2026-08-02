import { NextRequest, NextResponse } from 'next/server';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { whatsappAdapter } from '@/lib/intake/channels/whatsapp/adapter';
import { appendToIntake } from '@/lib/intake/session';
import { photosAddedMessage, photosFailedMessage, updateRequestMessage } from '@/lib/intake/messages';
import { createNotificationsForOpsAndAdmin } from '@/lib/notifications';

export const dynamic = 'force-dynamic';
// Multi-photo albums mean several 2-hop Graph downloads per POST — the plan
// default (10s) would 504 to Meta and trigger a retry storm.
export const maxDuration = 60;

/**
 * Meta webhook verification handshake (set the same verify token in the
 * Meta app dashboard). Echoes hub.challenge on match.
 */
export async function GET(request: NextRequest) {
  const challenge = whatsappAdapter.verifyWebhookChallenge(request.nextUrl.searchParams);
  if (challenge.status === 200) {
    return new NextResponse(challenge.body, { status: 200 });
  }
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

/**
 * Receives Cloud API events. Deliberately dumb and fast: verify signature,
 * persist text + media into the sender's open intake session, ack 200. All
 * parsing/decisions happen in the processing cron. Media is downloaded here —
 * not in the cron — because Meta media URLs expire in minutes.
 */
export async function POST(request: NextRequest) {
  if (!whatsappAdapter.isConfigured()) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }
  await loadFeatureFlags();
  if (!isFeatureEnabled('enableWhatsAppIntake')) {
    // Ack so Meta doesn't retry-storm while the flag is off; nothing stored.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const rawBody = await request.text();
  if (!whatsappAdapter.verifySignature(rawBody, request.headers)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  for (const message of whatsappAdapter.normalizeInbound(payload)) {
    // Session write + redelivery dedup happen BEFORE media download inside
    // appendToIntake; media resolves via this callback only for new messages.
    const outcome = await appendToIntake(message, whatsappAdapter.persistMedia);

    if (outcome.action === 'update_request') {
      // Explicit edit request: ack the sender, hand the change to ops with
      // the verbatim ask. Photos (if any) are already on the listing.
      await whatsappAdapter.sendText(
        message.senderId,
        updateRequestMessage(outcome.listingTitle ?? 'your listing', outcome.mediaStored, outcome.mediaFailed)
      );
      await createNotificationsForOpsAndAdmin({
        type: 'whatsapp_intake',
        title: `Update request for listing #${outcome.listingId} via WhatsApp — apply manually`,
        body: (message.text ?? '').slice(0, 300),
        link: `/dashboard/listings/${outcome.listingId}`,
      });
    } else if (outcome.action === 'attach_media') {
      // Photos after publish went straight onto the live listing — confirm to
      // the sender, and never stay silent when downloads failed.
      await whatsappAdapter.sendText(
        message.senderId,
        outcome.mediaStored > 0
          ? photosAddedMessage(outcome.listingTitle ?? 'your listing', outcome.mediaStored, outcome.mediaFailed)
          : photosFailedMessage()
      );
      if (outcome.mediaStored > 0) {
        await createNotificationsForOpsAndAdmin({
          type: 'whatsapp_intake',
          title: `${outcome.mediaStored} photo(s) added to listing #${outcome.listingId} via WhatsApp — spot-check`,
          link: `/dashboard/listings/${outcome.listingId}`,
        });
      }
    } else if (outcome.action === 'after_publish') {
      await createNotificationsForOpsAndAdmin({
        type: 'whatsapp_intake',
        title: `Sender replied after publish on intake #${outcome.intakeId} — may want changes`,
        link: '/back-office/whatsapp-intakes',
      });
    }

    // Failed downloads on ANY path are actionable: the sender believes those
    // photos were delivered.
    if (outcome.mediaFailed > 0 && outcome.action !== 'attach_media') {
      await createNotificationsForOpsAndAdmin({
        type: 'whatsapp_intake',
        title: `${outcome.mediaFailed} photo download(s) failed for intake #${outcome.intakeId} — check logs`,
        link: '/back-office/whatsapp-intakes',
      });
    }
  }

  return NextResponse.json({ ok: true });
}
