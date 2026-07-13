/**
 * Sender-facing reply copy for the intake pipeline. Channel-neutral pure
 * string builders — the adapter decides how to deliver them.
 */

export function needsInfoMessage(
  profileName: string | null,
  missingFields: string[],
  fallbackReason: string | null
): string {
  return `Thanks${profileName ? ' ' + profileName : ''}! To publish your listing we still need: ${
    missingFields.join(', ') || fallbackReason
  }. Just reply here with the details.`;
}

export function publishedMessage(title: string, listingUrl: string): string {
  return `🎉 Your listing "${title}" is now LIVE on Easy Rent: ${listingUrl}\nTenants will call or WhatsApp you directly. Reply here anytime to update it.`;
}

export function pendingReviewMessage(title: string): string {
  return `Thanks! Your listing "${title}" has been created and is with our team for a quick review. We'll message you when it's live.`;
}
