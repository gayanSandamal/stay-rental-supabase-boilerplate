import { db } from '@/lib/db/drizzle';
import { whatsappIntakes, listings, landlords, users } from '@/lib/db/schema';
import { and, eq, gte, desc, sql, inArray, isNull, or } from 'drizzle-orm';
import { detectUpdateIntent } from './parser/rule-parser';
import {
  clearConversation,
  detectCommand,
  isCancel,
  isDeleteConfirmation,
  parseMenuPick,
  readConversation,
  recordHandled,
  setConversation,
  wasHandled,
  type ConversationPayload,
} from './commands';
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
     * listing: the sender gets their own edit link instead of a needs-info
     * loop. Attached photos still go onto the listing.
     */
    | 'edit_link'
    /** Appended context onto a manual_review intake — stays with ops. */
    | 'appended_manual'
    /** Conversational commands (see lib/intake/commands.ts). */
    | 'delete_menu'
    | 'delete_menu_reprompt'
    | 'delete_confirm_prompt'
    | 'listing_deleted'
    | 'command_cancelled'
    | 'no_listings'
    | 'link_reissue'
    | 'help';
  intakeId?: number;
  /** attach_media / edit_link / delete: the live listing concerned. */
  listingId?: number | null;
  listingTitle?: string | null;
  /** delete_menu: the numbered options offered to the sender. */
  menu?: Array<{ index: number; id: number; title: string; city: string | null; status: string }>;
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
 * The sender's own listings, newest first, capped at 9 so a single-digit reply
 * is unambiguous. Union of two sources so legacy Ops-owned intake listings are
 * still reachable: listings owned by the sender's landlord row, plus listings
 * referenced by that sender's own intake rows.
 */
async function buildDeleteMenu(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  msg: NormalizedInboundMessage,
  _payload: ConversationPayload
): Promise<Array<{ index: number; id: number; title: string; city: string | null; status: string }>> {
  const e164 = msg.senderId.startsWith('+') ? msg.senderId : `+${msg.senderId}`;

  const owned = await tx
    .select({ id: listings.id, title: listings.title, city: listings.city, status: listings.status, createdAt: listings.createdAt })
    .from(listings)
    .innerJoin(landlords, eq(listings.landlordId, landlords.id))
    .innerJoin(users, eq(landlords.userId, users.id))
    .where(
      and(
        eq(users.waPhone, e164),
        isNull(users.deletedAt),
        inArray(listings.status, ['active', 'pending'])
      )
    );

  const viaIntake = await tx
    .select({ id: listings.id, title: listings.title, city: listings.city, status: listings.status, createdAt: listings.createdAt })
    .from(whatsappIntakes)
    .innerJoin(listings, eq(whatsappIntakes.listingId, listings.id))
    .where(
      and(
        eq(whatsappIntakes.channel, msg.channel),
        eq(whatsappIntakes.fromNumber, msg.senderId),
        inArray(listings.status, ['active', 'pending'])
      )
    );

  const byId = new Map<number, (typeof owned)[number]>();
  for (const row of [...owned, ...viaIntake]) byId.set(row.id, row);

  return [...byId.values()]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 9)
    .map((row, i) => ({
      index: i + 1,
      id: row.id,
      title: row.title,
      city: row.city,
      status: row.status,
    }));
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

    // ---- conversational commands -------------------------------------------
    // Ordering is deliberate: pending-state handling and strict command
    // detection run BEFORE the open-session append, because a bare "delete" or
    // "1" is never listing content. Any message carrying substantive text or
    // photos clears pending state and falls through, so a real submission is
    // never swallowed by a stale confirmation.
    const convo = await readConversation(tx, msg.channel, msg.senderId);
    const substantive = hasSubstantiveText(msg) || msg.mediaIds.length > 0;

    if (wasHandled(convo, msg.messageId)) {
      // Meta redelivered a command we already acted on.
      return { action: 'duplicate' } as const;
    }

    if (convo.state !== 'idle' && !substantive) {
      if (isCancel(msg.text)) {
        await clearConversation(tx, msg.channel, msg.senderId);
        await recordHandled(tx, msg.channel, msg.senderId, msg.messageId);
        return { action: 'command_cancelled' } as const;
      }

      if (convo.state === 'delete_pick') {
        const pick = parseMenuPick(msg.text);
        const ids = convo.payload.ids ?? [];
        const chosenId = pick ? ids[pick - 1] : undefined;
        if (chosenId) {
          const listing = await tx.query.listings.findFirst({ where: eq(listings.id, chosenId) });
          if (listing) {
            await setConversation(tx, msg.channel, msg.senderId, 'delete_confirm', {
              chosenId,
              chosenTitle: listing.title,
            });
            await recordHandled(tx, msg.channel, msg.senderId, msg.messageId);
            return {
              action: 'delete_confirm_prompt',
              listingId: chosenId,
              listingTitle: listing.title,
            } as const;
          }
        }
        const attempts = (convo.payload.attempts ?? 0) + 1;
        if (attempts >= 2) {
          await clearConversation(tx, msg.channel, msg.senderId);
          return { action: 'command_cancelled' } as const;
        }
        await setConversation(tx, msg.channel, msg.senderId, 'delete_pick', {
          ...convo.payload,
          attempts,
        });
        return { action: 'delete_menu_reprompt', menu: await buildDeleteMenu(tx, msg, convo.payload) } as const;
      }

      if (convo.state === 'delete_confirm') {
        // Anything other than the exact word cancels: ambiguity never destroys.
        if (!isDeleteConfirmation(msg.text)) {
          await clearConversation(tx, msg.channel, msg.senderId);
          await recordHandled(tx, msg.channel, msg.senderId, msg.messageId);
          return { action: 'command_cancelled' } as const;
        }
        const id = convo.payload.chosenId;
        const title = convo.payload.chosenTitle ?? 'your listing';
        if (!id) {
          await clearConversation(tx, msg.channel, msg.senderId);
          return { action: 'command_cancelled' } as const;
        }
        // Soft archive: instantly off the public site, reversible by ops, and
        // purged permanently after 30 days by the cron.
        await tx
          .update(listings)
          .set({ status: 'archived', archivedAt: new Date(), updatedAt: new Date() })
          .where(eq(listings.id, id));
        await clearConversation(tx, msg.channel, msg.senderId);
        await recordHandled(tx, msg.channel, msg.senderId, msg.messageId);
        return { action: 'listing_deleted', listingId: id, listingTitle: title } as const;
      }
    }

    if (convo.state !== 'idle' && substantive) {
      // A real submission arrived mid-confirmation: drop the pending state and
      // treat the message normally.
      await clearConversation(tx, msg.channel, msg.senderId);
    }

    const command = detectCommand(msg.text);
    if (command === 'help') {
      await recordHandled(tx, msg.channel, msg.senderId, msg.messageId);
      return { action: 'help' } as const;
    }
    if (command === 'link') {
      await recordHandled(tx, msg.channel, msg.senderId, msg.messageId);
      const menu = await buildDeleteMenu(tx, msg, {});
      const target = menu[0];
      return target
        ? ({ action: 'link_reissue', listingId: target.id, listingTitle: target.title } as const)
        : ({ action: 'no_listings' } as const);
    }
    if (command === 'delete') {
      const menu = await buildDeleteMenu(tx, msg, {});
      if (!menu.length) {
        await recordHandled(tx, msg.channel, msg.senderId, msg.messageId);
        return { action: 'no_listings' } as const;
      }
      await setConversation(tx, msg.channel, msg.senderId, 'delete_pick', {
        ids: menu.map((m) => m.id),
      });
      await recordHandled(tx, msg.channel, msg.senderId, msg.messageId);
      return { action: 'delete_menu', menu } as const;
    }

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
          action: 'edit_link',
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

    if ((base.action === 'attach_media' || base.action === 'edit_link') && base.listingId) {
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
