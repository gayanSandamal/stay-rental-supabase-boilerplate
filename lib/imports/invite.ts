/**
 * Inviting an advert's owner to send us the listing themselves.
 *
 * WHY THIS EXISTS. Facebook serves a logged-out request its OpenGraph preview
 * and nothing else: the first line, one cover photo, no author, no phone
 * number. Verified live on 2026-09-08 — the post body was absent from the whole
 * 346 KB response. No amount of parsing recovers data that is not in the bytes,
 * the Groups API has been gone since 2024-04-22, and a logged-in session cookie
 * is a standing prohibition.
 *
 * So stop trying to take the advert and ask for it instead. An operator pastes
 * this as a COMMENT on the original post; the owner messages us; the intake
 * pipeline — which has always handled a landlord sending their own property —
 * receives the full text, every photo, their name, and a number Meta has
 * proven. Everything the scrape cannot get, by the only route that gets it.
 *
 * IT IS ALSO THE BETTER CONSENT. `lib/imports/consent.ts` asks over a Marketing
 * template, which a recipient who has switched marketing messages off never
 * receives — accepted by Meta, delivered to nobody, indistinguishable from
 * being ignored. Someone who messages us first has opted in unmistakably, opens
 * the 24-hour service window, and costs nothing per message.
 *
 * THE COMMENT IS PASTED BY HAND. Commenting on a third-party post cannot be
 * automated: same App Review gate that blocks reading it. This is the Facebook
 * Group draft pattern from docs/deep-dive-social-auto-publish.md — we compose,
 * a human posts.
 */

import { getWhatsAppSupportNumber, formatWhatsAppDisplay } from '@/lib/site-config';

/**
 * The reference an owner's first message carries back.
 *
 * Plain and short because a human retypes it when the deep link fails —
 * `FB-41` survives being read off a screen and typed on a phone in a way a
 * token does not. It is deliberately NOT a secret: it authorises nothing, it
 * only lets ops match an inbound submission to the draft it makes redundant.
 * Anyone who guesses one has merely told us which advert they are talking
 * about, which is what the comment asked them to do anyway.
 */
export function inviteReference(importId: number): string {
  return `FB-${importId}`;
}

/** `FB-41` anywhere in an inbound message, however the sender cased it. */
export const INVITE_REFERENCE_RE = /\bFB-(\d{1,9})\b/i;

export function parseInviteReference(text: string | null | undefined): number | null {
  const match = text?.match(INVITE_REFERENCE_RE);
  const id = match ? Number(match[1]) : NaN;
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * The wa.me link the comment points at, prefilled so the owner only presses
 * send. Null when no support number is configured — the caller then offers the
 * comment without a link rather than one that goes nowhere.
 */
export function inviteWhatsAppLink(importId: number): string | null {
  const number = getWhatsAppSupportNumber();
  if (!number) return null;
  const text = `Hi Easy Rent — this is my property. ${inviteReference(importId)}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/**
 * The comment an operator pastes under the original advert.
 *
 * WRITTEN TO BE POSTED IN PUBLIC, under someone else's advert, where their
 * prospective tenants will read it. So it says who we are, what we want and
 * what it costs in the first two lines, and it never implies we have already
 * done anything with their property — because at this point we have not, and
 * the whole reason this channel exists is that the alternative did.
 *
 * "Free of charge" and not "affordable": the platform's public positioning is
 * that listing is free, and affordability invites a comparison with ikman that
 * free of charge ends (see the business-model note in CLAUDE.md).
 */
export function inviteCommentText(importId: number): string {
  const link = inviteWhatsAppLink(importId);
  const display = formatWhatsAppDisplay();

  const contact = link
    ? `WhatsApp us here: ${link}`
    : display
      ? `WhatsApp us on ${display}`
      : 'Send us a WhatsApp message';

  return [
    'Hi! We are Easy Rent, a rental marketplace in Sri Lanka.',
    '',
    'If this is your property, we will list it for you free of charge — no fee, no commission. Send us the details and photos on WhatsApp and we will do the rest, with your own number shown to renters.',
    '',
    contact,
    '',
    `Please keep the reference ${inviteReference(importId)} in your message so we know which advert you mean.`,
  ].join('\n');
}
