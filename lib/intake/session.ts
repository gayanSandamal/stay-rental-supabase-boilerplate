import { db } from '@/lib/db/drizzle';
import { whatsappIntakes } from '@/lib/db/schema';
import { and, eq, gte, desc } from 'drizzle-orm';
import type { NormalizedInboundMessage } from './channels/types';

/** Messages from the same sender within this window append to one intake. */
export const SESSION_WINDOW_MS = 6 * 60 * 60 * 1000;

/**
 * Append a normalized inbound message to the sender's open intake session,
 * or start a new one. Idempotent against webhook redelivery via message ids.
 * New info reopens a needs_info intake for reprocessing.
 */
export async function appendToIntake(
  msg: NormalizedInboundMessage,
  mediaUrls: string[]
): Promise<void> {
  const windowStart = new Date(Date.now() - SESSION_WINDOW_MS);

  // Reuse the sender's open session (received or needs_info) if recent.
  // Channel-scoped: a Telegram sender id can never collide with a WhatsApp one.
  const open = await db.query.whatsappIntakes.findFirst({
    where: and(
      eq(whatsappIntakes.channel, msg.channel),
      eq(whatsappIntakes.fromNumber, msg.senderId),
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
    if (msg.messageId && ids.includes(msg.messageId)) return; // webhook redelivery
    const media = parseArr(open.mediaPaths);
    media.push(...mediaUrls);

    await db
      .update(whatsappIntakes)
      .set({
        messageText: [open.messageText, msg.text].filter(Boolean).join('\n'),
        mediaPaths: JSON.stringify(media),
        waMessageIds: JSON.stringify([...ids, msg.messageId].filter(Boolean)),
        profileName: open.profileName ?? msg.senderName,
        // New info reopens a needs_info intake for reprocessing.
        status: 'received',
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(whatsappIntakes.id, open.id));
    return;
  }

  await db.insert(whatsappIntakes).values({
    channel: msg.channel,
    fromNumber: msg.senderId,
    profileName: msg.senderName,
    messageText: msg.text,
    mediaPaths: JSON.stringify(mediaUrls),
    waMessageIds: JSON.stringify(msg.messageId ? [msg.messageId] : []),
  });
}
