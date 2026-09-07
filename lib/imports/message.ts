/**
 * The message an owner gets when we list their property for them.
 *
 * THE TEMPLATE TEXT IS THE CONTRACT. `IMPORT_TEMPLATE_TEXT` is not
 * documentation — it is the exact body that must be registered and approved in
 * the WhatsApp Manager. Meta matches on the approved template, so a variable
 * count that drifts from this file starts failing for every recipient at once,
 * with nothing failing locally to warn you. A unit test holds the two in
 * agreement.
 *
 * WHY A TEMPLATE AT ALL. Every other outbound message in the intake pipeline
 * rides inside the 24-hour customer-service window the landlord's own message
 * opened. This one cannot: the recipient has never contacted us — that is the
 * entire premise of importing their ad. Free-form there is rejected outright
 * (error 131047), so it is an approved template or nothing.
 *
 * WHY IT LEADS WITH REMOVAL. We have republished someone's advert without
 * asking. The one thing that makes that defensible is that taking it down is
 * trivial and obvious: a tap on the button, or one word back. "REMOVE" is not
 * invented for this message — `DELETE_RE` in lib/intake/command-words.ts
 * already accepts it, so a reply lands in the existing delete flow rather than
 * a dead end. That reply also opens the 24-hour window and proves the number,
 * which is why nothing else here needs a second template.
 *
 * PARAMETERS CANNOT CONTAIN NEWLINES, tabs, or 5+ consecutive spaces, and every
 * declared variable must always be non-empty — Meta rejects the send otherwise.
 * `sanitizeTemplateParam` enforces the first; the fallbacks below enforce the
 * second.
 */

/**
 * Register EXACTLY this body in the WhatsApp Manager, category **Utility**,
 * with ONE dynamic URL button whose base is `https://easyrent.lk/l/` and whose
 * suffix is the access token.
 *
 * Category note for whoever registers it: Utility is the honest reading — the
 * message concerns the recipient's own property and its main purpose is to
 * offer control over it. Meta may nonetheless reclassify a message about a
 * service the recipient never signed up for as Marketing, which costs more and
 * is blocked more often. If that happens, the fix is to cut everything that
 * reads as promotion, not to argue the category.
 */
export const IMPORT_TEMPLATE_TEXT = `🏠 Easy Rent — your property is now listed

Hi {{1}}, we saw your rental ad for {{2}} in {{3}} on Facebook and listed it on Easy Rent, Sri Lanka's rental marketplace. Listing is completely free — we never charge for it.

Tenants will contact you directly on {{4}}. We never take a commission.

Tap below to edit the details or take it down — no password needed. Or reply REMOVE and we'll delete it.`;

export const IMPORT_TEMPLATE_PARAM_COUNT = 4;

export interface ImportNotificationInput {
  ownerName: string | null;
  listingTitle: string;
  city: string | null;
  ownerPhone: string;
}

/**
 * A greeting is not a byline. A nameless owner gets "there" rather than a
 * placeholder or an email address — "Hi Property owner" reads as a mailmerge
 * failure to the one person guaranteed to notice.
 */
export function greetingName(name: string | null): string {
  const trimmed = name?.trim();
  if (!trimmed || trimmed.toLowerCase() === 'property owner') return 'there';
  return trimmed.split(/\s+/)[0];
}

/**
 * Exactly IMPORT_TEMPLATE_PARAM_COUNT values, none of them ever empty. The
 * fallbacks are not defensive noise: Meta rejects the whole send if a declared
 * variable resolves to an empty string, so "no city recorded" has to render as
 * words rather than as nothing.
 */
export function importTemplateParams(input: ImportNotificationInput): string[] {
  return [
    greetingName(input.ownerName),
    input.listingTitle.trim() || 'your property',
    input.city?.trim() || 'Sri Lanka',
    input.ownerPhone.trim(),
  ];
}

/** What the template will read as, for the dry-run log and the in-app copy. */
export function renderImportText(params: string[], link: string): string {
  return params
    .reduce(
      (text, value, index) => text.replaceAll(`{{${index + 1}}}`, value),
      IMPORT_TEMPLATE_TEXT
    )
    .concat(`\n\n${link}`);
}
