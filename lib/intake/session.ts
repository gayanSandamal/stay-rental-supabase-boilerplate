import { db } from '@/lib/db/drizzle';
import { whatsappIntakes, listings } from '@/lib/db/schema';
import { and, eq, gte, desc, sql } from 'drizzle-orm';
import { detectUpdateIntent } from './parser/rule-parser';
import type { NormalizedInboundMessage } from './channels/types';

/** Messages from the same sender within this window append to one intake. */
export const SESSION_WINDOW_MS = 6 * 60 * 60 * 1000;
/**
 * A needs_info intake waits far longer than the batching window — landlords
 * routinely answer the next morning, and losing the session context would
 * restart them from zero.
 */
export const NEEDS_INFO_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** "Thanks!" after publish should not spawn a fresh junk intake. */
export const AFTER_PUBLISH_WINDOW_MS = 48 * 60 * 60 * 1000;
/** Explicit "change/remove/update …" requests target a listing this old. */
export const UPDATE_REQUEST_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/** How far back message-id redelivery dedup looks (any status). */
const DEDUP_LOOKBACK_MS = NEEDS_INFO_WINDOW_MS;

export interface AppendOutcome {
  action:
    | 'duplicate'
    /** Appended to an open session (received/needs_info) and reopened. */
    | 'appended'
    | 'created'
    /** Thin text after publish — surfaced to ops, not re-parsed. */
    | 'after_publish'
    /**
     * Photos (without new-property text) after publish: appended straight to
     * the published listing's gallery — "Reply here anytime to update it"
     * must actually work.
     */
    | 'attach_media'
    /**
     * Explicit edit request ("change the rent to…") for a recent published
     * listing: acked to the sender, applied by ops. Attached photos still go
     * onto the listing.
     */
    | 'update_request'
    /** Appended context onto a manual_review intake — stays with ops. */
    | 'appended_manual';
  intakeId?: number;
  /** attach_media / update_request: the live listing being changed. */
  listingId?: number | null;
  listingTitle?: string | null;
  /** Photos persisted / photo downloads that failed (all actions). */
  mediaStored: number;
  mediaFailed: number;
}

const parseArr = (s: string | null | undefined): string[] => {
  try {
    const v = JSON.parse(s ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

/**
 * Text that reads like a fresh property submission (an amount or a long
 * description). Deliberately ignores attached media: photos WITHOUT such text
 * shortly after a publish are gallery updates for that listing, while photos
 * WITH it are a new property (caption-style submissions).
 */
function hasSubstantiveText(msg: NormalizedInboundMessage): boolean {
  const text = msg.text ?? '';
  return /\d{4,}|\d+(?:\.\d+)?\s*k\b|lakh/i.test(text) || text.length > 80;
}

/**
 * Serialize all session work per (channel, sender): Meta delivers album
 * messages as near-simultaneous webhook POSTs, and an unguarded
 * read-modify-write loses photos or double-inserts sessions.
 */
async function withSenderLock<T>(
  channel: string,
  senderId: string,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${channel}), hashtext(${senderId}))`
    );
    return fn(tx);
  });
}

/**
 * Append a normalized inbound message to the sender's intake session.
 * Two-phase: the message text/id is committed first under a per-sender
 * advisory lock (dedupes Meta redelivery BEFORE any slow media download),
 * then media is downloaded and attached in a second short transaction.
 */
export async function appendToIntake(
  msg: NormalizedInboundMessage,
  persistMedia: (mediaId: string) => Promise<string | null>
): Promise<AppendOutcome> {
  const outcome = await withSenderLock(msg.channel, msg.senderId, async (tx) => {
    const recent = await tx.query.whatsappIntakes.findMany({
      where: and(
        eq(whatsappIntakes.channel, msg.channel),
        eq(whatsappIntakes.fromNumber, msg.senderId),
        gte(whatsappIntakes.lastMessageAt, new Date(Date.now() - DEDUP_LOOKBACK_MS))
      ),
      orderBy: [desc(whatsappIntakes.lastMessageAt)],
      limit: 5,
    });

    // Webhook redelivery dedup across ALL recent sessions — a message
    // redelivered after its session published must not seed a new intake.
    if (msg.messageId && recent.some((r) => parseArr(r.waMessageIds).includes(msg.messageId))) {
      return { action: 'duplicate' } as const;
    }

    const appendTo = async (
      row: (typeof recent)[number],
      set: Partial<typeof whatsappIntakes.$inferInsert>
    ) => {
      await tx
        .update(whatsappIntakes)
        .set({
          messageText: [row.messageText, msg.text].filter(Boolean).join('\n'),
          waMessageIds: JSON.stringify([...parseArr(row.waMessageIds), msg.messageId].filter(Boolean)),
          profileName: row.profileName ?? msg.senderName,
          hasUnsupportedMedia: row.hasUnsupportedMedia || Boolean(msg.unsupportedMedia),
          updatedAt: new Date(),
          ...set,
        })
        .where(eq(whatsappIntakes.id, row.id));
    };

    const latest = recent[0];
    const age = latest ? Date.now() - latest.lastMessageAt.getTime() : Infinity;

    // Open session (received within 6h, needs_info within 7d): append + reopen.
    const open = recent.find(
      (r) =>
        (r.status === 'received' &&
          Date.now() - r.lastMessageAt.getTime() <= SESSION_WINDOW_MS) ||
        (r.status === 'needs_info' &&
          Date.now() - r.lastMessageAt.getTime() <= NEEDS_INFO_WINDOW_MS)
    );
    if (open) {
      await appendTo(open, { status: 'received', lastMessageAt: new Date() });
      return { action: 'appended', intakeId: open.id } as const;
    }

    // Explicit edit request ("change the rent to 95,000", "remove the last
    // photo") from a sender with a recent published listing: never re-enter
    // the submission parser — ack the sender, hand the change to ops. Checked
    // AFTER open sessions (mid-flight messages belong to the in-flight
    // submission) and BEFORE the ambient after-publish branches (explicit
    // intent wins over heuristics).
    if (msg.text && detectUpdateIntent(msg.text)) {
      const target = await tx.query.whatsappIntakes.findFirst({
        where: and(
          eq(whatsappIntakes.channel, msg.channel),
          eq(whatsappIntakes.fromNumber, msg.senderId),
          eq(whatsappIntakes.status, 'published'),
          gte(whatsappIntakes.lastMessageAt, new Date(Date.now() - UPDATE_REQUEST_WINDOW_MS))
        ),
        orderBy: [desc(whatsappIntakes.lastMessageAt)],
      });
      if (target?.listingId) {
        await appendTo(target, { lastMessageAt: new Date() });
        const listing = await tx.query.listings.findFirst({
          where: eq(listings.id, target.listingId),
        });
        return {
          action: 'update_request',
          intakeId: target.id,
          listingId: target.listingId,
          listingTitle: listing?.title ?? null,
        } as const;
      }
      // No listing to target — fall through to the normal submission flow.
    }

    // Follow-up shortly after publish without new-property text: photos are a
    // gallery update for the published listing ("Reply here anytime to update
    // it"); thin text stays on the intake for ops context. Never a fresh
    // needs_info loop. Substantive text (± photos) falls through to a new
    // intake — that's a second property.
    if (
      latest &&
      latest.status === 'published' &&
      age <= AFTER_PUBLISH_WINDOW_MS &&
      !hasSubstantiveText(msg)
    ) {
      await appendTo(latest, {});
      if (msg.mediaIds.length > 0) {
        return { action: 'attach_media', intakeId: latest.id, listingId: latest.listingId } as const;
      }
      return { action: 'after_publish', intakeId: latest.id } as const;
    }

    // More context for an intake ops is already reviewing: append, do NOT
    // reopen — scam/duplicate-flagged intakes must not re-enter the auto path.
    if (latest && latest.status === 'manual_review' && age <= NEEDS_INFO_WINDOW_MS) {
      await appendTo(latest, { lastMessageAt: new Date() });
      return { action: 'appended_manual', intakeId: latest.id } as const;
    }

    const [created] = await tx
      .insert(whatsappIntakes)
      .values({
        channel: msg.channel,
        fromNumber: msg.senderId,
        profileName: msg.senderName,
        messageText: msg.text,
        mediaPaths: '[]',
        waMessageIds: JSON.stringify(msg.messageId ? [msg.messageId] : []),
        hasUnsupportedMedia: Boolean(msg.unsupportedMedia),
      })
      .returning({ id: whatsappIntakes.id });
    return { action: 'created', intakeId: created.id } as const;
  });

  const base: AppendOutcome = { ...outcome, mediaStored: 0, mediaFailed: 0 };
  if (base.action === 'duplicate' || msg.mediaIds.length === 0) return base;

  // Phase 2 — download media OUTSIDE any transaction (Graph fetches take
  // seconds; a held row lock or pooled connection would serialize the world).
  const mediaUrls: string[] = [];
  for (const mediaId of msg.mediaIds) {
    const url = await persistMedia(mediaId);
    if (url) mediaUrls.push(url);
  }
  base.mediaStored = mediaUrls.length;
  base.mediaFailed = msg.mediaIds.length - mediaUrls.length;
  if (mediaUrls.length === 0) return base;

  // Phase 3 — attach URLs under the lock (concurrent album siblings each
  // append their own URLs without clobbering). For attach_media the photos
  // ALSO go onto the live listing's gallery.
  await withSenderLock(msg.channel, msg.senderId, async (tx) => {
    const row = await tx.query.whatsappIntakes.findFirst({
      where: eq(whatsappIntakes.id, base.intakeId!),
    });
    if (!row) return;
    await tx
      .update(whatsappIntakes)
      .set({
        mediaPaths: JSON.stringify([...parseArr(row.mediaPaths), ...mediaUrls]),
        updatedAt: new Date(),
      })
      .where(eq(whatsappIntakes.id, row.id));

    if ((base.action === 'attach_media' || base.action === 'update_request') && base.listingId) {
      const listing = await tx.query.listings.findFirst({
        where: eq(listings.id, base.listingId),
      });
      if (!listing) return;
      const existing = parseArr(typeof listing.photos === 'string' ? listing.photos : null);
      await tx
        .update(listings)
        .set({
          photos: JSON.stringify([...existing, ...mediaUrls]),
          updatedAt: new Date(),
        })
        .where(eq(listings.id, listing.id));
      base.listingTitle = listing.title;
    }
  });

  return base;
}
