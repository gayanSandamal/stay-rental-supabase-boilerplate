/**
 * Sender-facing reply copy for the intake pipeline. Channel-neutral pure
 * string builders — the adapter decides how to deliver them.
 */

/** Appended when the sender's attachments arrived as video/file/voice note. */
export const RESEND_AS_PHOTOS_NOTE =
  'PS: attachments sent as videos, files or voice notes don’t come through — please resend your photos as regular WhatsApp pictures.';

/** Landlord-facing labels for ParsedIntake field names. */
const FIELD_LABELS: Record<string, string> = {
  title: 'the property type (house / apartment / room)',
  address: 'the street address',
  city: 'the town or city',
  bedrooms: 'the number of bedrooms',
  rentPerMonth: 'the monthly rent',
};

const label = (f: string) => FIELD_LABELS[f] ?? f;

export function needsInfoMessage(
  profileName: string | null,
  missingFields: string[],
  fallbackReason: string | null,
  opts: { unsupportedMedia?: boolean } = {}
): string {
  const greeting = `Thanks${profileName ? ' ' + profileName : ''}!`;
  // Field asks read as a list; other retriable reasons (multi-property, odd
  // rent) are already full sentences.
  const base = missingFields.length
    ? `${greeting} To publish your listing we still need: ${missingFields.map(label).join(', ')}. Just reply here with the details.`
    : `${greeting} ${fallbackReason ?? 'We need a bit more information'}. Just reply here with the details.`;
  return opts.unsupportedMedia ? `${base}\n${RESEND_AS_PHOTOS_NOTE}` : base;
}

export function publishedMessage(
  title: string,
  listingUrl: string,
  opts: { unsupportedMedia?: boolean } = {}
): string {
  const base = `🎉 Your listing "${title}" is now LIVE on Easy Rent: ${listingUrl}\nTenants will call or WhatsApp you directly. Reply here anytime to update it.`;
  return opts.unsupportedMedia ? `${base}\n${RESEND_AS_PHOTOS_NOTE}` : base;
}

export function pendingReviewMessage(title: string): string {
  return `Thanks! Your listing "${title}" has been created and is with our team for a quick review. We'll message you when it's live.`;
}

/** Photos sent after publish were added straight to the live listing. */
export function photosAddedMessage(title: string, added: number, failed: number): string {
  const base = `📸 Added ${added} photo${added === 1 ? '' : 's'} to "${title}".`;
  const fail =
    failed > 0
      ? ` ${failed} photo${failed === 1 ? '' : 's'} didn't come through — please send ${failed === 1 ? 'it' : 'them'} again.`
      : '';
  return `${base}${fail}\nIf they were meant for a different listing, reply here and our team will sort it out.`;
}

/** Every photo download failed — never leave the sender thinking it worked. */
export function photosFailedMessage(): string {
  return `Sorry — we couldn't receive your photos just now. Please try sending them again in a moment.`;
}

/** Explicit edit request acknowledged; ops applies it manually. */
export function updateRequestMessage(
  title: string,
  photosAdded: number,
  photosFailed: number
): string {
  const parts = [`✏️ Got it — our team will update "${title}" as requested.`];
  if (photosAdded > 0) {
    parts.push(`📸 ${photosAdded} photo${photosAdded === 1 ? '' : 's'} already added.`);
  }
  if (photosFailed > 0) {
    parts.push(
      `${photosFailed} photo${photosFailed === 1 ? '' : 's'} didn't come through — please send ${photosFailed === 1 ? 'it' : 'them'} again.`
    );
  }
  parts.push(`If you meant a different listing, reply here with its link.`);
  return parts.join('\n');
}
