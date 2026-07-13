import { NextRequest, NextResponse } from 'next/server';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { whatsappAdapter } from '@/lib/intake/channels/whatsapp/adapter';
import { appendToIntake } from '@/lib/intake/session';

export const dynamic = 'force-dynamic';

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
    const mediaUrls: string[] = [];
    for (const mediaId of message.mediaIds) {
      const url = await whatsappAdapter.persistMedia(mediaId);
      if (url) mediaUrls.push(url);
    }
    await appendToIntake(message, mediaUrls);
  }

  return NextResponse.json({ ok: true });
}
