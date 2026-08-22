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

/** "a, b and c" — a field ask should read like a sentence, not a CSV row. */
const naturalJoin = (items: string[]): string =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/**
 * One-line echo of what the parser understood, e.g. "a 5-bedroom house in
 * Kolonnawa for LKR 85,000/month". Null when nothing useful was extracted.
 * Without this echo a landlord can't tell a partial parse from being ignored —
 * the single most-reported UX failure of the original flow.
 */
export function summarizeUnderstood(parsed: {
  propertyType?: string | null;
  bedrooms?: number | null;
  city?: string | null;
  rentPerMonth?: number | null;
}): string | null {
  const type = parsed.propertyType && parsed.propertyType !== 'unknown' ? parsed.propertyType : null;
  if (!type && !parsed.city && !parsed.rentPerMonth) return null;
  const noun = type ?? 'property';
  const thing = parsed.bedrooms ? `a ${parsed.bedrooms}-bedroom ${noun}` : `a ${noun}`;
  const where = parsed.city ? ` in ${parsed.city}` : '';
  const rent = parsed.rentPerMonth ? ` for LKR ${parsed.rentPerMonth.toLocaleString('en-US')}/month` : '';
  return `${thing}${where}${rent}`;
}

export function needsInfoMessage(
  profileName: string | null,
  missingFields: string[],
  fallbackReason: string | null,
  opts: {
    unsupportedMedia?: boolean;
    understood?: string | null;
    /** A town we think they misspelled, when we are not sure enough to apply it. */
    citySuggestion?: { city: string; from: string } | null;
  } = {}
): string {
  const greeting = `Thanks${profileName ? ' ' + profileName : ''}!`;
  // Asked as a question, never applied silently: this suggestion came from
  // fuzzy-matching free text, and filing a listing under the wrong town is a
  // mistake nobody downstream would ever catch.
  if (opts.citySuggestion) {
    const { city, from } = opts.citySuggestion;
    return `${greeting} Did you mean ${city}? You wrote "${from}". Reply ${city} to confirm, or tell us the correct town.`;
  }
  // Acknowledge what WAS understood before asking for more — the ask alone
  // reads as "the bot ignored my message".
  const echo = opts.understood ? ` Got it — ${opts.understood}.` : '';
  // Field asks read as a list; other retriable reasons (multi-property, odd
  // rent) are complete sentences that carry their own instruction.
  const base = missingFields.length
    ? `${greeting}${echo} To publish we still need: ${naturalJoin(missingFields.map(label))}. Just reply here with the details.`
    : `${greeting} ${fallbackReason ?? 'We need a bit more information — just reply here with the details'}.`;
  return opts.unsupportedMedia ? `${base}\n${RESEND_AS_PHOTOS_NOTE}` : base;
}

/**
 * Instant acknowledgment sent from the webhook the moment a new submission
 * arrives. The parse reply follows minutes later from the cron — without this,
 * a first-time landlord stares at grey ticks wondering if the number is dead.
 */
export function receivedAckMessage(profileName: string | null): string {
  return `Got it${profileName ? ', ' + profileName : ''}! We're putting your listing together — you'll hear from us here in a few minutes.`;
}

/**
 * First-contact template sent when a brand-new submission is created. Mirrors
 * the "please send us these details" pattern owners already expect from other
 * WhatsApp businesses: it both acknowledges receipt AND tells them exactly what
 * to include, cutting the needs_info back-and-forth. It replaces
 * receivedAckMessage on the first-contact path so a greeting-only sender ("hi")
 * and a full-listing sender both get something coherent.
 *
 * The closing line is deliberate: owners rarely reply in the listed order or
 * wording, and they must not feel they have to. The rule parser handles
 * free-form Sinhala-English text, so the template guides without demanding a
 * format — nothing downstream assumes the reply mirrors this list.
 *
 * A contact number is deliberately NOT asked for. The sender's WhatsApp number
 * is already attached to the listing as a VERIFIED contact (processIntake —
 * possession is proven by WhatsApp itself), and the rule parser masks and
 * discards phone numbers in the message body, so a typed number is silently
 * thrown away. Asking would collect nothing and imply the typed number is what
 * tenants see. The list says so explicitly instead.
 */
/**
 * The fill-in form a first-time sender completes in place and sends back.
 *
 * THIS COPY IS PARSER INPUT, not just human text. Whatever the landlord returns
 * goes straight to `parseIntakeRules`, so the layout is constrained by
 * lib/intake/parser/rule-parser.ts and cannot be reworded freely:
 *
 * 1. The ENGLISH label must sit immediately before the dash. `extractCount`
 *    returns the first pattern that matches in list order, and the English
 *    patterns (`/(?:bed\s?rooms?|beds?)\s*[:\-]?\s*(\d+)/`) are listed first —
 *    so an English label adjacent to the value always wins the race.
 * 2. That ordering also defuses a live hazard: `/(\d+)\s*(?:kamara|කාමර)/gu`
 *    matches digits, then ANY whitespace including a newline, then කාමර. Native
 *    labels at the start of a line sit exactly where a previous line's number
 *    could bleed into them. Keeping the correct English match first means the
 *    bleed never gets a chance to fire. tests/unit/rule-parser.test.ts pins it.
 * 3. The language separator is `·`, NOT `/` — `/` collides with the label
 *    "Town / city" and with real addresses like "45/2".
 *
 * No title line: composeTitle() builds one from bedrooms + type + city.
 * No contact-number line: the sender's number is already attached as a verified
 * contact, and the parser discards typed numbers, so asking collects nothing
 * and implies the typed number is what tenants would see.
 */
export function newListingTemplateMessage(profileName: string | null): string {
  return [
    `Thanks${profileName ? ' ' + profileName : ''}! 🏠`,
    '',
    'නිවසක් ලැයිස්තුගත කරන්න · வீட்டைப் பதிவு செய்ய · To list your property —',
    'fill this in and send it back:',
    '',
    'වර්ගය · வகை · Property type - ',
    'ලිපිනය · முகவரி · Address - ',
    'නගරය · நகரம் · Town / city - ',
    'කාමර · அறைகள் · Bedrooms - ',
    'නාන කාමර · குளியலறை · Bathrooms - ',
    'මාසික කුලිය · மாத வாடகை · Monthly rent (LKR) - ',
    'විස්තර · விவரம் · About the place - ',
    '',
    '📷 ඡායාරූප · புகைப்படங்கள் · Photos — send a few',
    '',
    'Any language is fine, and you can send it in one message or a few — we’ll put it together and reply here.',
    '',
    'Tenants will contact you on this WhatsApp number, so there’s no need to send one.',
  ].join('\n');
}

/** Ack for a reply that answers a "we still need…" ask. Sent once per round. */
export function updateAckMessage(): string {
  return `Thanks — got it! Updating your listing now, give us a few minutes.`;
}

/**
 * Sent when an intake lands in manual review (suspected duplicate, flagged
 * content, processing error). Deliberately vague about the cause, but never
 * silent — the sender must know a human has it, or they wait forever.
 */
export function manualReviewMessage(profileName: string | null): string {
  return `Thanks${profileName ? ' ' + profileName : ''}! Our team is taking a quick look at your listing and will get back to you here soon.`;
}

/** Some photos from the submission never made it — say so immediately. */
export function photosMissedMessage(failed: number): string {
  return `⚠️ ${failed} photo${failed === 1 ? '' : 's'} didn't come through — please send ${failed === 1 ? 'it' : 'them'} again.`;
}

/** A shared location pin was stored against the in-flight submission. */
export function locationReceivedMessage(): string {
  return `📍 Got your location — thanks!`;
}

/** A pin sent shortly after publish was saved onto that listing. */
export function locationSavedMessage(title: string): string {
  return `📍 Location added to "${title}".`;
}

/** Body for the interactive share-location request. */
export function locationRequestPrompt(): string {
  return `Or tap below to share the property's location instead of typing the address.`;
}

export interface ListingLinks {
  viewUrl: string;
  editUrl?: string | null;
  deleteUrl?: string | null;
}

/**
 * The publish confirmation. The view URL goes FIRST because WhatsApp previews
 * only the first link in a message.
 */
/**
 * Photos refused for being over `maxPhotosPerListing`. Empty string when none,
 * so the no-cap output stays byte-identical to before the cap existed.
 */
export function photosOverCapNote(overCap: number, cap: number): string {
  if (overCap < 1 || !Number.isFinite(cap) || cap < 1) return '';
  return (
    `\n\n🖼️ We show up to ${cap} photos per listing, so the last ` +
    `${overCap === 1 ? 'one wasn’t' : `${overCap} weren’t`} used. ` +
    'Reply here any time to swap one in.'
  );
}

export function publishedMessage(
  title: string,
  links: ListingLinks,
  opts: { unsupportedMedia?: boolean; photosOverCap?: number; photoCap?: number } = {}
): string {
  const parts = [`🎉 Your listing "${title}" is now LIVE on Easy Rent:`, links.viewUrl];
  if (links.editUrl) {
    parts.push('', '✏️ Edit it yourself (opens instantly, no password):', links.editUrl);
  }
  if (links.deleteUrl) {
    parts.push('', '🗑️ Remove it:', links.deleteUrl);
  }
  // The 48h photo-append window has always existed but was never announced,
  // which made a genuinely useful feature undiscoverable.
  parts.push('', '📷 Want to add photos? Just send them here within 2 days.');
  parts.push('', 'Tenants will call or WhatsApp you directly.');
  const base = parts.join('\n');
  const withMedia = opts.unsupportedMedia ? `${base}\n${RESEND_AS_PHOTOS_NOTE}` : base;
  return withMedia + photosOverCapNote(opts.photosOverCap ?? 0, opts.photoCap ?? 0);
}

export function pendingReviewMessage(
  title: string,
  links?: Pick<ListingLinks, 'editUrl' | 'deleteUrl'> | null,
  opts: { photosOverCap?: number; photoCap?: number } = {}
): string {
  const parts = [
    `Thanks! Your listing "${title}" has been created and is with our team for a quick review. We'll message you when it's live.`,
  ];
  if (links?.editUrl) parts.push('', '✏️ You can change the details meanwhile:', links.editUrl);
  // The remove link belongs here, not only on publishedMessage. With the
  // automated checks armed every intake lands pending, so publishedMessage —
  // the only other message carrying a delete link — is never sent, and the
  // approval notice is a bare public URL. Without this the landlord is never
  // given one. Access links are reusable, so it keeps working once live, and a
  // landlord who spots a mistake can pull the listing before anyone sees it.
  if (links?.deleteUrl) parts.push('', '🗑️ Or remove it:', links.deleteUrl);
  return parts.join('\n') + photosOverCapNote(opts.photosOverCap ?? 0, opts.photoCap ?? 0);
}

/** Photos sent after publish were added to the live listing (or queued first). */
export function photosAddedMessage(
  title: string,
  added: number,
  failed: number,
  opts: { queued?: boolean; overCap?: number } = {}
): string {
  const base = opts.queued
    ? `📸 Got ${added} photo${added === 1 ? '' : 's'} for "${title}" — ${added === 1 ? 'it' : 'they'} will appear in a couple of minutes once checked.`
    : `📸 Added ${added} photo${added === 1 ? '' : 's'} to "${title}".`;
  const fail =
    failed > 0
      ? ` ${failed} photo${failed === 1 ? '' : 's'} didn't come through — please send ${failed === 1 ? 'it' : 'them'} again.`
      : '';
  // Deliberately NOT phrased as a failure: asking them to resend a photo we
  // refused on purpose would loop forever.
  const over =
    (opts.overCap ?? 0) > 0
      ? ` ${opts.overCap} more ${opts.overCap === 1 ? 'photo' : 'photos'} didn't fit — this listing is at its photo limit.`
      : '';
  return `${base}${fail}${over}\nIf they were meant for a different listing, reply here and our team will sort it out.`;
}

/** Every photo download failed — never leave the sender thinking it worked. */
export function photosFailedMessage(): string {
  return `Sorry — we couldn't receive your photos just now. Please try sending them again in a moment.`;
}

/**
 * Edit requests are no longer applied by ops — the landlord edits it themselves
 * through their own link.
 */
export function editLinkMessage(
  title: string,
  editUrl: string | null,
  photosAdded = 0,
  photosFailed = 0
): string {
  const parts: string[] = [];
  parts.push(
    editUrl
      ? `✏️ You can change "${title}" yourself here — the link signs you in, no password needed:\n${editUrl}`
      : `✏️ Got it — our team will update "${title}" as requested.`
  );
  if (photosAdded > 0) {
    parts.push(`📸 ${photosAdded} photo${photosAdded === 1 ? '' : 's'} already added.`);
  }
  if (photosFailed > 0) {
    parts.push(
      `${photosFailed} photo${photosFailed === 1 ? '' : 's'} didn't come through — please send ${photosFailed === 1 ? 'it' : 'them'} again.`
    );
  }
  return parts.join('\n');
}

/** Reply to "LINK": hand back working links for their latest listing. */
export function linkReissuedMessage(links: ListingLinks & { title?: string | null }): string {
  const parts = [
    links.title ? `Here are your links for "${links.title}":` : 'Here are your links:',
    `👀 View: ${links.viewUrl}`,
  ];
  if (links.editUrl) parts.push(`✏️ Edit: ${links.editUrl}`);
  if (links.deleteUrl) parts.push(`🗑️ Remove: ${links.deleteUrl}`);
  parts.push('', 'These sign you in automatically — keep them private.');
  return parts.join('\n');
}

export interface DeleteMenuItem {
  index: number;
  title: string;
  city: string | null;
  status: string;
}

/** Step 1 of delete: a numbered list, so a pick is unambiguous. */
export function deleteMenuMessage(items: DeleteMenuItem[]): string {
  const lines = ['Which listing would you like to remove?', ''];
  for (const i of items) {
    const where = i.city ? `, ${i.city}` : '';
    const pending = i.status === 'pending' ? ' (awaiting review)' : '';
    lines.push(`${i.index}. ${i.title}${where}${pending}`);
  }
  lines.push('', 'Reply with the number, or CANCEL to stop.');
  return lines.join('\n');
}

/** Step 2 of delete: an exact typed word. Anything else cancels. */
export function deleteConfirmMessage(title: string): string {
  return `You're about to remove "${title}" from Easy Rent.\n\nReply DELETE to confirm, or anything else to cancel.`;
}

export function deleteDoneMessage(title: string): string {
  return `🗑️ Removed "${title}". It's no longer visible to tenants.\n\nChanged your mind? Reply RESTORE within 30 days and we'll put it back. Or send new details any time to list again.`;
}

/** RESTORE matched a recently archived listing — ops take it from here. */
export function restoreRequestedMessage(title: string): string {
  return `Got it — our team will restore "${title}" shortly and message you here when it's back up.`;
}

export function deleteCancelledMessage(): string {
  return `No changes made. Send DELETE again if you'd like to remove a listing.`;
}

export function noListingsMessage(): string {
  return `You don't have any live listings with us right now. Send the property details (address, town, bedrooms and monthly rent) and we'll create one.`;
}

/**
 * LINK asked for, the listing exists, but self-service links can't be minted
 * (legacy listing with no landlord account). Telling them "you have no
 * listings" — the old behavior — was factually wrong and alarming.
 */
export function listingLiveNoLinksMessage(title: string | null, viewUrl: string): string {
  return [
    `Your listing${title ? ` "${title}"` : ''} is live here:`,
    viewUrl,
    '',
    `Self-service links aren't available for this listing yet — reply here with what you'd like to change and our team will help.`,
  ].join('\n');
}

/**
 * Same no-links situation but the listing is still pending — "is live" plus a
 * URL that 404s for an unauthenticated visitor would be a double lie.
 */
export function listingPendingNoLinksMessage(title: string | null): string {
  return `Your listing${title ? ` "${title}"` : ''} is with our team for a quick review — we'll message you when it's live. Reply here if you'd like to change anything meanwhile.`;
}

/** Reply to "HELP" / "MENU". */
export function helpMessage(): string {
  return [
    'Here’s what you can do:',
    '',
    '🏠 Send the details (address, town, bedrooms, monthly rent) plus photos — we’ll create the listing.',
    '✏️ Send LINK — we’ll reply with links to view, edit or remove your listings.',
    '🗑️ Send DELETE — we’ll help you take a listing down.',
  ].join('\n');
}

/**
 * Someone messaged an intake that is held for human review. Says the thread is
 * alive without promising a listing — the hold may be a genuine scam flag.
 */
export function manualReviewPendingMessage(): string {
  return `Thanks — got it. Our team is reviewing this submission and will get back to you here shortly.`;
}

export interface CityChoice {
  city: string;
  district: string;
}

/**
 * Numbered menu for a town we could not identify with certainty.
 *
 * Numbered rather than free text because a reply of "1" cannot itself be
 * misread, whereas re-typing the town invites the same misspelling again. The
 * final option is always "keep what I typed", so a landlord in a village the
 * catalogue has never heard of is never trapped in the menu.
 */
export function cityChoiceMessage(
  profileName: string | null,
  typed: string,
  choices: CityChoice[]
): string {
  const lines = [
    `Thanks${profileName ? ' ' + profileName : ''}! We couldn't find "${typed}" — did you mean:`,
    '',
  ];
  choices.forEach((c, i) => lines.push(`${i + 1}. ${c.city} (${c.district} District)`));
  lines.push(`${choices.length + 1}. Keep "${typed}" as I typed it`);
  lines.push('', `Just reply with a number — 1 to ${choices.length + 1}.`);
  return lines.join('\n');
}

/** Confirms the pick and says what happens next, so the reply is never a dead end. */
export function cityChosenMessage(city: string, district: string): string {
  return `📍 Got it — ${city}, ${district} District. Putting your listing together now.`;
}

/** They kept their own spelling: it is used as-is and our team takes a look. */
export function cityKeptMessage(typed: string): string {
  return `📍 Got it — we'll use "${typed}". Our team will add it to our town list shortly.`;
}

/** The reply was not one of the offered numbers. */
export function cityChoiceUnclearMessage(max: number): string {
  return `Sorry — please reply with just a number from 1 to ${max}.`;
}

/* -------------------------------------------------------------------------- */
/* Contact-number verification (see lib/auth/phone-verification.ts)            */
/* -------------------------------------------------------------------------- */

/**
 * Possession proven. Names the number back so the landlord can see WHICH of
 * their numbers this was — several landlords run an office line and a mobile.
 */
export function numberVerifiedMessage(phone: string): string {
  return [
    `✅ Verified — ${phone} is now confirmed on Easy Rent.`,
    '',
    'Renters will see a “Verified” badge next to it on your listings. Nothing else to do.',
  ].join('\n');
}

/**
 * Right code, wrong sender.
 *
 * Deliberately says nothing about which number the code was for. Whoever is
 * holding this code may have picked it up from a screenshot or a forwarded
 * message, and naming the target would hand them the other half of it.
 */
export function verifyWrongSenderMessage(): string {
  return [
    "That code was issued for a different phone number, so we can't confirm it from this one.",
    '',
    'Please send it from the phone you are verifying — the code has to come from that number itself.',
  ].join('\n');
}

/** Expired, spent, or unknown — all point back to the same fresh-code action. */
export function verifyCodeUnusableMessage(
  reason: 'expired' | 'not_found' | 'already_used' | 'too_many_attempts'
): string {
  if (reason === 'already_used') {
    return 'That number is already verified — nothing more to do. 👍';
  }
  const lead =
    reason === 'expired'
      ? 'That code has expired.'
      : reason === 'too_many_attempts'
        ? 'That code has been tried too many times.'
        : "We don't recognise that code.";
  return `${lead}\n\nOpen your Easy Rent dashboard, go to your contact numbers and tap “Verify on WhatsApp” for a fresh one.`;
}

// --- social auto-publish ----------------------------------------------------

/**
 * The consent ask, sent right after "your listing is live".
 *
 * Asked per listing rather than once per landlord: a landlord may be happy to
 * advertise an empty annex widely and not the house they still live in.
 *
 * Names the networks explicitly. "Our social media" is not informed consent
 * when the landlord cannot tell whether that means a page with 200 followers
 * or a public TikTok.
 */
export function socialConsentPrompt(title: string): string {
  return [
    `📣 Want more tenants to see "${title}"?`,
    '',
    "We can share it on Easy Rent's Facebook page, Instagram and TikTok — your photos, the rent and a link back to your listing.",
    '',
    'Your phone number is never included. Tenants still reach you through Easy Rent.',
    '',
    'Reply YES to share it, or NO to skip.',
  ].join('\n');
}

/** The two taps offered when rich replies are on. */
export function socialConsentButtons(listingId: number): Array<{ id: string; title: string }> {
  return [
    { id: `social_yes:${listingId}`, title: 'Yes, share it' },
    { id: `social_no:${listingId}`, title: 'No thanks' },
  ];
}

export function socialConsentGrantedMessage(title: string): string {
  return `👍 Thanks! We'll post "${title}" to our channels shortly.\n\nChanged your mind? Just tell us here and we'll take it down.`;
}

export function socialConsentDeclinedMessage(): string {
  return "No problem — we'll keep it on Easy Rent only. 👍";
}

/** One published social post, as the landlord needs to see it. */
export interface SocialResultItem {
  platform: string;
  permalink?: string | null;
  /** Nothing was actually sent — the adapter had no credentials. */
  dryRun: boolean;
}

const SOCIAL_RESULT_LABELS: Record<string, string> = {
  facebook_page: '📘 Facebook',
  instagram: '📷 Instagram',
  tiktok: '🎵 TikTok',
};

/**
 * "Here is where your listing went live."
 *
 * Returns null when nothing genuinely posted, and the caller then sends
 * NOTHING. Announcing a share that only ever happened as a dry run is the same
 * lie as a `posted` badge for a post that never existed — the failure this
 * feature already had once, in the back office.
 *
 * The Facebook Group row is deliberately absent: it is an ops paste-draft, not
 * something the landlord can open, so listing it would promise a post that no
 * API can make (Meta removed the Groups API on 2024-04-22).
 */
export function socialResultsMessage(
  title: string,
  results: SocialResultItem[],
  pullDownUrl: string | null
): string | null {
  const live = results.filter(
    (r) => !r.dryRun && r.platform !== 'facebook_group' && SOCIAL_RESULT_LABELS[r.platform]
  );
  if (!live.length) return null;

  const lines = [`✅ "${title}" is now on Easy Rent's social media.`, ''];
  for (const r of live) {
    const label = SOCIAL_RESULT_LABELS[r.platform];
    // A platform that posted but withheld its permalink (Instagram sometimes
    // does) is still reported. Dropping it would understate where their photos
    // actually are, which is the opposite of the point of this message.
    lines.push(r.permalink ? `${label}: ${r.permalink}` : `${label}: posted (link not available)`);
  }
  lines.push('', 'Have a look, and share it with anyone who might be interested.');

  if (pullDownUrl) {
    lines.push(
      '',
      'Changed your mind? Take it off our social media here:',
      pullDownUrl
    );
  }
  return lines.join('\n');
}

