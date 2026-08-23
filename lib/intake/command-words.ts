/**
 * What counts as a command word, in every language we answer in.
 *
 * Split out of `commands.ts` because that module reaches for the database and
 * these matchers do not — and two callers now need them from a pure context:
 * the conversation layer (which acts on commands) and `accumulator.ts` (which
 * must be sure a reply is NOT one before storing it as listing data).
 *
 * Keeping one copy is the whole point. When a landlord is told "reply ඔව්",
 * every part of the pipeline has to agree that ඔව් is an answer and not an
 * address; a second, drifting word list is how "yes" ends up published as the
 * street name of a house.
 *
 * `commands.ts` re-exports all of this, so existing imports are unaffected.
 */

export type Command = 'delete' | 'link' | 'help' | 'restore';

const DELETE_RE =
  /^(?:delete|remove|unlist|take\s+down|delete\s+(?:my\s+)?listing|remove\s+(?:my\s+)?listing|මකන්න|අයින්\s*කරන්න|நீக்கு|அழி)[.!]?$/i;
const LINK_RE = /^(?:link|links|my\s+link|my\s+links|edit\s+link|edit|sign\s*in|login)[.!]?$/i;
const HELP_RE = /^(?:help|menu|options|\?|උදව්|உதவி)[.!]?$/i;
/** Undo a chat delete — deleteDoneMessage advertises this word explicitly. */
const RESTORE_RE = /^(?:restore|undo|undelete|restore\s+(?:my\s+)?listing)[.!]?$/i;
const CANCEL_RE = /^(?:cancel|stop|no|nevermind|never\s*mind|අවලංගු|ரத்து)[.!]?$/i;
/** The one word that actually deletes. Case-insensitive, nothing else counts. */
const CONFIRM_RE = /^delete[.!]?$/i;
/**
 * A plain yes, for the social-sharing consent prompt. Only ever consulted while
 * `confirm_social` is pending — it grants permission, it never destroys
 * anything, so it can afford to be more generous than CONFIRM_RE.
 * Sinhala ඔව්/හරි, Tamil ஆம்/சரி.
 */
const AFFIRMATIVE_RE =
  /^(?:yes|yeah|yep|yes\s*please|ok|okay|sure|go\s*ahead|do\s*it|post\s*it|share\s*it|please|ඔව්|හරි|ஆம்|சரி)[.!]?$/i;

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

/** An unambiguous yes. See AFFIRMATIVE_RE for why this is broader than DELETE. */
export function isAffirmative(text: string | null | undefined): boolean {
  return AFFIRMATIVE_RE.test((text ?? '').trim());
}

/** A single-digit menu pick, 1-9. Returns null when it isn't one. */
export function parseMenuPick(text: string | null | undefined): number | null {
  const m = (text ?? '').trim().match(/^([1-9])[.)]?$/);
  return m ? Number(m[1]) : null;
}

/**
 * Is this whole message one of our own keywords rather than listing data?
 *
 * Used where a reply is about to be stored as a field: a landlord answering
 * "ඔව්" to "what is the address?" is acknowledging us, not naming a street,
 * and storing it would publish "ඔව්" as the address of a real house.
 */
export function isCommandWord(text: string | null | undefined): boolean {
  const t = (text ?? '').trim();
  if (!t) return false;
  return (
    detectCommand(t) !== null || isCancel(t) || isAffirmative(t) || isDeleteConfirmation(t)
  );
}
