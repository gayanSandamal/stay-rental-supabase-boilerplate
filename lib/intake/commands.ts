/**
 * Conversational commands over the messaging channel: DELETE, LINK, HELP.
 *
 * Detection is STRICT whole-message matching on a short message, deliberately
 * narrower than `detectUpdateIntent` (which fires on any edit verb anywhere in
 * the text). A single word is never meaningful listing content, so this can run
 * before the session append without ever swallowing a real submission; anything
 * looser must fall through to the parser.
 *
 * Multi-step state lives in `intake_conversations` — one row per (channel,
 * sender) — not on `whatsapp_intakes`, which models one property submission.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { intakeConversations } from '@/lib/db/schema';

/**
 * The pure matchers live in ./command-words.ts so `accumulator.ts` can use them
 * without dragging the database in. Re-exported here so every existing import
 * of this module keeps working, and so there is exactly one word list.
 */
export {
  detectCommand,
  isAffirmative,
  isCancel,
  isCommandWord,
  isDeleteConfirmation,
  parseMenuPick,
  type Command,
} from './command-words';

/** Pending confirmations expire, so a stale reply can never delete something. */
export const PENDING_TTL_MS = 15 * 60 * 1000;
/** How many recent command message ids we remember for redelivery dedup. */
const HANDLED_HISTORY = 20;

export type ConversationState =
  | 'idle'
  | 'delete_pick'
  | 'delete_confirm'
  /** Offered a numbered list of towns; waiting for the sender to pick one. */
  | 'confirm_city'
  /**
   * Asked whether we may share a just-published listing on Easy Rent's own
   * social accounts; waiting for yes/no. Unlike the states above, an
   * unrecognised reply here does NOT reprompt — see lib/intake/session.ts.
   */
  | 'confirm_social';

export interface ConversationPayload {
  /** Listing ids in menu order, so "2" always means the same listing. */
  ids?: number[];
  /** The listing chosen at the pick step. */
  chosenId?: number;
  chosenTitle?: string;
  /** Reprompt counter, so a confused sender isn't looped forever. */
  attempts?: number;
  /** Towns offered for confirm_city, in menu order so "2" is stable. */
  cityChoices?: Array<{ city: string; district: string }>;
  /** Exactly what the sender typed, for the "keep it" option and the ops queue. */
  cityTyped?: string;
  /** The submission the answer belongs to. */
  cityIntakeId?: number;
  /** The listing a confirm_social answer applies to. */
  socialListingId?: number;
}

export interface Conversation {
  state: ConversationState;
  payload: ConversationPayload;
  expired: boolean;
  handledIds: string[];
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function parsePayload(raw: string | null): ConversationPayload {
  try {
    const v = JSON.parse(raw ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function parseIds(raw: string | null): string[] {
  try {
    const v = JSON.parse(raw ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function readConversation(
  tx: Tx,
  channel: string,
  fromNumber: string
): Promise<Conversation> {
  const row = await tx.query.intakeConversations.findFirst({
    where: and(
      eq(intakeConversations.channel, channel),
      eq(intakeConversations.fromNumber, fromNumber)
    ),
  });
  if (!row) return { state: 'idle', payload: {}, expired: false, handledIds: [] };
  const expired = Boolean(row.expiresAt && row.expiresAt.getTime() < Date.now());
  return {
    state: (expired ? 'idle' : (row.state as ConversationState)) ?? 'idle',
    payload: parsePayload(row.payload),
    expired,
    handledIds: parseIds(row.handledMessageIds),
  };
}

export async function setConversation(
  tx: Tx,
  channel: string,
  fromNumber: string,
  state: ConversationState,
  payload: ConversationPayload = {},
  /**
   * How long the pending state stays answerable. Defaults to the 15-minute
   * confirmation window, which is right for a destructive prompt — a stale
   * "DELETE" must never land. A consent question is not destructive and
   * landlords routinely answer the next morning, so confirm_social passes a
   * much longer TTL (see lib/social/consent.ts).
   */
  ttlMs: number = PENDING_TTL_MS
): Promise<void> {
  const now = new Date();
  const expiresAt = state === 'idle' ? null : new Date(now.getTime() + ttlMs);
  await tx
    .insert(intakeConversations)
    .values({
      channel,
      fromNumber,
      state,
      payload: JSON.stringify(payload),
      expiresAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [intakeConversations.channel, intakeConversations.fromNumber],
      set: {
        state,
        payload: JSON.stringify(payload),
        expiresAt,
        updatedAt: now,
      },
    });
}

export async function clearConversation(tx: Tx, channel: string, fromNumber: string): Promise<void> {
  await setConversation(tx, channel, fromNumber, 'idle', {});
}

/**
 * Remember that a command message id was acted on. Without this, Meta
 * redelivering the "DELETE" message after the state was cleared would archive a
 * second listing.
 */
export async function recordHandled(
  tx: Tx,
  channel: string,
  fromNumber: string,
  messageId: string | null | undefined
): Promise<void> {
  if (!messageId) return;
  const existing = await readConversation(tx, channel, fromNumber);
  const ids = [messageId, ...existing.handledIds.filter((i) => i !== messageId)].slice(
    0,
    HANDLED_HISTORY
  );
  const now = new Date();
  await tx
    .insert(intakeConversations)
    .values({
      channel,
      fromNumber,
      state: existing.state,
      handledMessageIds: JSON.stringify(ids),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [intakeConversations.channel, intakeConversations.fromNumber],
      set: { handledMessageIds: JSON.stringify(ids), updatedAt: now },
    });
}

export function wasHandled(conversation: Conversation, messageId: string | null | undefined): boolean {
  return Boolean(messageId && conversation.handledIds.includes(messageId));
}
