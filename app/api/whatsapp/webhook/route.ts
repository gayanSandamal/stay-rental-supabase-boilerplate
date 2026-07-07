import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db/drizzle';
import { whatsappIntakes } from '@/lib/db/schema';
import { and, eq, gte, desc } from 'drizzle-orm';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { whatsappConfig, isIntakeConfigured } from '@/lib/whatsapp/config';
import { persistWhatsAppMedia } from '@/lib/whatsapp/media';

export const dynamic = 'force-dynamic';

/** Messages from the same sender within this window append to one intake. */
const SESSION_WINDOW_MS = 6 * 60 * 60 * 1000;

/**
 * Meta webhook verification handshake (set the same verify token in the
 * Meta app dashboard). Echoes hub.challenge on match.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (
    whatsappConfig.verifyToken &&
    params.get('hub.mode') === 'subscribe' &&
    params.get('hub.verify_token') === whatsappConfig.verifyToken
  ) {
    return new NextResponse(params.get('hub.challenge') ?? '', { status: 200 });
  }
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

/**
 * Receives Cloud API events. Deliberately dumb and fast: verify signature,
 * persist text + media into the sender's open intake row, ack 200. All
 * parsing/decisions happen in the processing cron.
 */
export async function POST(request: NextRequest) {
  if (!isIntakeConfigured()) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }
  await loadFeatureFlags();
  if (!isFeatureEnabled('enableWhatsAppIntake')) {
    // Ack so Meta doesn't retry-storm while the flag is off; nothing stored.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const rawBody = await request.text();

  // X-Hub-Signature-256: HMAC-SHA256 of the raw body with the app secret.
  const signature = request.headers.get('x-hub-signature-256') ?? '';
  const expected =
    'sha256=' +
    crypto.createHmac('sha256', whatsappConfig.appSecret!).update(rawBody).digest('hex');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      const messages = value?.messages ?? [];
      const profileName: string | null =
        value?.contacts?.[0]?.profile?.name ?? null;

      for (const message of messages) {
        const from: string | undefined = message?.from;
        if (!from) continue;

        let text: string | null = null;
        let mediaUrl: string | null = null;

        if (message.type === 'text') {
          text = message.text?.body ?? null;
        } else if (message.type === 'image') {
          // Media URLs expire in minutes — download now, not in the cron.
          mediaUrl = await persistWhatsAppMedia(message.image?.id);
          text = message.image?.caption ?? null;
        } else {
          continue; // ignore other types (audio, stickers, reactions…)
        }

        await appendToIntake({
          from,
          profileName,
          messageId: String(message.id ?? ''),
          text,
          mediaUrl,
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}

async function appendToIntake(args: {
  from: string;
  profileName: string | null;
  messageId: string;
  text: string | null;
  mediaUrl: string | null;
}) {
  const windowStart = new Date(Date.now() - SESSION_WINDOW_MS);

  // Reuse the sender's open session (received or needs_info) if recent.
  const open = await db.query.whatsappIntakes.findFirst({
    where: and(
      eq(whatsappIntakes.fromNumber, args.from),
      gte(whatsappIntakes.lastMessageAt, windowStart)
    ),
    orderBy: [desc(whatsappIntakes.lastMessageAt)],
  });

  const parseArr = (s: string | null | undefined): string[] => {
    try {
      const v = JSON.parse(s ?? '[]');
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };

  if (open && (open.status === 'received' || open.status === 'needs_info')) {
    const ids = parseArr(open.waMessageIds);
    if (args.messageId && ids.includes(args.messageId)) return; // webhook redelivery
    const media = parseArr(open.mediaPaths);
    if (args.mediaUrl) media.push(args.mediaUrl);

    await db
      .update(whatsappIntakes)
      .set({
        messageText: [open.messageText, args.text].filter(Boolean).join('\n'),
        mediaPaths: JSON.stringify(media),
        waMessageIds: JSON.stringify([...ids, args.messageId].filter(Boolean)),
        profileName: open.profileName ?? args.profileName,
        // New info reopens a needs_info intake for reprocessing.
        status: 'received',
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(whatsappIntakes.id, open.id));
    return;
  }

  await db.insert(whatsappIntakes).values({
    fromNumber: args.from,
    profileName: args.profileName,
    messageText: args.text,
    mediaPaths: JSON.stringify(args.mediaUrl ? [args.mediaUrl] : []),
    waMessageIds: JSON.stringify(args.messageId ? [args.messageId] : []),
  });
}
