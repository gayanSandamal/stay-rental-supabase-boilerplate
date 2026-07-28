import { NextRequest, NextResponse } from 'next/server';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { whatsappAdapter } from '@/lib/intake/channels/whatsapp/adapter';
import { appendToIntake } from '@/lib/intake/session';
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
    if (outcome.action === 'after_publish') {
      await createNotificationsForOpsAndAdmin({
        type: 'whatsapp_intake',
        title: `Sender replied after publish on intake #${outcome.intakeId} — may want changes`,
        link: '/back-office/whatsapp-intakes',
      });
    }
  }

  return NextResponse.json({ ok: true });
}
