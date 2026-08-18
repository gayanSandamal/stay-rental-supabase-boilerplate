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

export type Command = 'delete' | 'link' | 'help' | 'restore';

/** Pending confirmations expire, so a stale reply can never delete something. */
export const PENDING_TTL_MS = 15 * 60 * 1000;
/** How many recent command message ids we remember for redelivery dedup. */
const HANDLED_HISTORY = 20;

const DELETE_RE = /^(?:delete|remove|unlist|take\s+down|delete\s+(?:my\s+)?listing|remove\s+(?:my\s+)?listing|මකන්න|අයින්\s*කරන්න|நீக்கு|அழி)[.!]?$/i;
const LINK_RE = /^(?:link|links|my\s+link|my\s+links|edit\s+link|edit|sign\s*in|login)[.!]?$/i;
const HELP_RE = /^(?:help|menu|options|\?|උදව්|உதவி)[.!]?$/i;
/** Undo a chat delete — deleteDoneMessage advertises this word explicitly. */
const RESTORE_RE = /^(?:restore|undo|undelete|restore\s+(?:my\s+)?listing)[.!]?$/i;
const CANCEL_RE = /^(?:cancel|stop|no|nevermind|never\s*mind|අවලංගු|ரத்து)[.!]?$/i;
/** The one word that actually deletes. Case-insensitive, nothing else counts. */
const CONFIRM_RE = /^delete[.!]?$/i;

/**
 * A command must be the WHOLE message and short. The digit guard stops a real
 * listing ("remove 2 rooms, 45000 per month") being read as a command.
 */
export function detectCommand(text: string | null | undefined): Command | null {
  const t = (text ?? '').trim();
  if (!t || t.length > 40) return null;
  if (/\d{4,}/.test(t)) return null;
  if (DELETE_RE.test(t)) return 'delete';
  if (LINK_RE.test(t)) return 'link';
  if (HELP_RE.test(t)) return 'help';
  if (RESTORE_RE.test(t)) return 'restore';
  return null;
}

export function isCancel(text: string | null | undefined): boolean {
  return CANCEL_RE.test((text ?? '').trim());
}

export function isDeleteConfirmation(text: string | null | undefined): boolean {
  return CONFIRM_RE.test((text ?? '').trim());
}

/** A single-digit menu pick, 1-9. Returns null when it isn't one. */
export function parseMenuPick(text: string | null | undefined): number | null {
  const m = (text ?? '').trim().match(/^([1-9])[.)]?$/);
  return m ? Number(m[1]) : null;
}

export type ConversationState =
  | 'idle'
  | 'delete_pick'
  | 'delete_confirm'
  /** Offered a numbered list of towns; waiting for the sender to pick one. */
  | 'confirm_city';

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
  payload: ConversationPayload = {}
): Promise<void> {
  const now = new Date();
  await tx
    .insert(intakeConversations)
    .values({
      channel,
      fromNumber,
      state,
      payload: JSON.stringify(payload),
      expiresAt: state === 'idle' ? null : new Date(now.getTime() + PENDING_TTL_MS),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [intakeConversations.channel, intakeConversations.fromNumber],
      set: {
        state,
        payload: JSON.stringify(payload),
        expiresAt: state === 'idle' ? null : new Date(now.getTime() + PENDING_TTL_MS),
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
