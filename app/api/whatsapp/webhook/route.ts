import { NextRequest, NextResponse } from 'next/server';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { loadLocations } from '@/lib/locations/store';
import { whatsappAdapter } from '@/lib/intake/channels/whatsapp/adapter';
import {
  markWhatsAppRead,
  sendWhatsAppButtons,
  sendWhatsAppList,
} from '@/lib/intake/channels/whatsapp/send';
import { appendToIntake } from '@/lib/intake/session';
import {
  deleteCancelledMessage,
  deleteConfirmMessage,
  deleteDoneMessage,
  deleteMenuMessage,
  editLinkMessage,
  helpMessage,
  linkReissuedMessage,
  listingLiveNoLinksMessage,
  listingPendingNoLinksMessage,
  locationReceivedMessage,
  locationSavedMessage,
  noListingsMessage,
  manualReviewPendingMessage,
  photosAddedMessage,
  photosFailedMessage,
  photosMissedMessage,
  newListingTemplateMessage,
  receivedAckMessage,
  restoreRequestedMessage,
  updateAckMessage,
} from '@/lib/intake/messages';
import { parseIntakeRules } from '@/lib/intake/parser/rule-parser';
import { hasListingDetail } from '@/lib/intake/parser/types';
import { mintAccessLink } from '@/lib/auth/access-links';
import { db } from '@/lib/db/drizzle';
import { landlords, users } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { createNotificationsForOpsAndAdmin } from '@/lib/notifications';

export const dynamic = 'force-dynamic';
// Multi-photo albums mean several 2-hop Graph downloads per POST — the plan
// default (10s) would 504 to Meta and trigger a retry storm.
export const maxDuration = 60;

const publicBaseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://easyrent.lk';

/**
 * Meta webhook verification handshake (set the same verify token in the
 * Meta app dashboard). Echoes hub.challenge on match.
 */
export async function GET(request: NextRequest) {
  const challenge = whatsappAdapter.verifyWebhookChallenge(request.nextUrl.searchParams);
  if (challenge.status === 200) {
    return new NextResponse(challenge.body, { status: 200 });
  }
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

/**
 * Receives Cloud API events. Deliberately dumb and fast: verify signature,
 * persist text + media into the sender's open intake session, ack 200. All
 * parsing/decisions happen in the processing cron. Media is downloaded here —
 * not in the cron — because Meta media URLs expire in minutes.
 */
export async function POST(request: NextRequest) {
  if (!whatsappAdapter.isConfigured()) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }
  await loadFeatureFlags();
  // Town catalogue for the matcher. Cached per instance behind a TTL, so
  // this is a no-op after the first call — same contract as the flags above.
  await loadLocations();
  if (!isFeatureEnabled('enableWhatsAppIntake')) {
    // Ack so Meta doesn't retry-storm while the flag is off; nothing stored.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const rawBody = await request.text();
  if (!whatsappAdapter.verifySignature(rawBody, request.headers)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const rich = isFeatureEnabled('enableWhatsAppRichReplies');
  const messages = whatsappAdapter.normalizeInbound(payload);

  // Blue-tick once per POST (reading the newest message marks the thread read
  // up to it) and DON'T await — it is purely cosmetic, and stacking its 8s
  // budget per album message ahead of media downloads risks the 60s kill.
  const newestId = messages[messages.length - 1]?.messageId;
  if (rich && newestId) {
    void markWhatsAppRead(newestId, { typing: true }).catch(() => {});
  }

  // Did this delivery already describe a property? Computed across the WHOLE
  // batch, not per message: an album arrives as one message per photo with the
  // caption riding on only one of them, and the session is created by whichever
  // lands first. Pure regex over text already in memory — no IO, so the webhook
  // stays thin.
  const batchHasDetail = (() => {
    const text = messages
      .map((m) => m.text)
      .filter(Boolean)
      .join('\n');
    return text ? hasListingDetail(parseIntakeRules(text)) : false;
  })();

  for (const message of messages) {
    try {
      await handleInbound(message, rich, batchHasDetail);
    } catch (err) {
      // One malformed message must not 500 the whole POST — Meta would
      // redeliver the entire batch in a retry storm.
      console.error('[webhook] message handling failed', message.messageId, err);
      await createNotificationsForOpsAndAdmin({
        type: 'whatsapp_intake',
        title: `WhatsApp message ${message.messageId} failed to process — check logs`,
        link: '/back-office/whatsapp-intakes',
      }).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleInbound(
  message: ReturnType<typeof whatsappAdapter.normalizeInbound>[number],
  rich: boolean,
  batchHasDetail: boolean
): Promise<void> {
  {
    // Session write + redelivery dedup happen BEFORE media download inside
    // appendToIntake; media resolves via this callback only for new messages.
    const outcome = await appendToIntake(message, whatsappAdapter.persistMedia);

    if (outcome.action === 'created') {
      // First contact for this submission: without an instant reply the sender
      // hears NOTHING until the settle window + cron tick (~5 minutes).
      //
      // WHICH reply depends on what they sent. Handing the checklist to someone
      // who just typed a full listing reads as "the bot ignored my message" —
      // it asks for the very fields they supplied. So the template is for
      // senders who opened with "hi" or photos alone; anyone who already
      // described a property gets the plain ack, and the processing job follows
      // with a needs-info reply naming only the gaps.
      if (rich) {
        await whatsappAdapter.sendText(
          message.senderId,
          batchHasDetail
            ? receivedAckMessage(message.senderName)
            : newListingTemplateMessage(message.senderName)
        );
      } else if (outcome.pinStored) {
        // Pin acks are unconditional (pins were silently dropped before this
        // existed) — with rich off, nothing else acknowledges a first-contact pin.
        await whatsappAdapter.sendText(message.senderId, locationReceivedMessage());
      }
    } else if (outcome.action === 'appended' || outcome.action === 'appended_manual') {
      if (outcome.pinStored) {
        await whatsappAdapter.sendText(message.senderId, locationReceivedMessage());
      } else if (rich && outcome.action === 'appended' && outcome.reopenedFromNeedsInfo) {
        // Exactly one message per needs_info round flips the status back, so
        // this can't spam a multi-message answer.
        await whatsappAdapter.sendText(message.senderId, updateAckMessage());
      }

      // A held intake used to swallow everything: the sender saw a typing
      // bubble and then nothing, forever, and ops were never told the thread
      // was still alive. Both halves now hear about it.
      if (outcome.action === 'appended_manual') {
        await whatsappAdapter.sendText(message.senderId, manualReviewPendingMessage());
        await createNotificationsForOpsAndAdmin({
          type: 'whatsapp_intake',
          title: `Sender added more to intake #${outcome.intakeId}, which is held for review`,
          body: 'They are waiting on a human. Resolve the hold or reply to them directly.',
          link: '/back-office/whatsapp-intakes',
        });
      }
    } else if (outcome.action === 'location_saved') {
      await whatsappAdapter.sendText(
        message.senderId,
        locationSavedMessage(outcome.listingTitle ?? 'your listing')
      );
      // Coordinates of a LIVE listing changed from an inbound message — leave
      // the same trace attach_media does.
      await createNotificationsForOpsAndAdmin({
        type: 'whatsapp_intake',
        title: `Location pin updated coordinates of listing #${outcome.listingId} via WhatsApp — spot-check`,
        link: `/dashboard/listings/${outcome.listingId}`,
      });
    } else if (outcome.action === 'restore_request') {
      await whatsappAdapter.sendText(
        message.senderId,
        restoreRequestedMessage(outcome.listingTitle ?? 'your listing')
      );
      await createNotificationsForOpsAndAdmin({
        type: 'whatsapp_intake',
        title: `RESTORE requested for archived listing #${outcome.listingId} via WhatsApp — set it back to active`,
        link: `/dashboard/listings/${outcome.listingId}`,
      });
    } else if (outcome.action === 'edit_link') {
      // Edit requests are self-service now: hand back a link that signs them in.
      const links = await linksFor(message.senderId, outcome.listingId ?? null);
      await whatsappAdapter.sendText(
        message.senderId,
        editLinkMessage(
          outcome.listingTitle ?? 'your listing',
          links?.editUrl ?? null,
          outcome.mediaStored,
          outcome.mediaFailed
        )
      );
      // Only bother ops when we could NOT give them a link.
      if (!links) {
        await createNotificationsForOpsAndAdmin({
          type: 'whatsapp_intake',
          title: `Update request for listing #${outcome.listingId} via WhatsApp — apply manually`,
          body: (message.text ?? '').slice(0, 300),
          link: `/dashboard/listings/${outcome.listingId}`,
        });
      }
    } else if (outcome.action === 'delete_menu' || outcome.action === 'delete_menu_reprompt') {
      const menu = outcome.menu ?? [];
      // Native list picker when rich replies are on — a tap can't be mistyped.
      // Text menu remains both the flag-off path and the send-failure fallback.
      const sentList = rich
        ? await sendWhatsAppList(message.senderId, {
            body: 'Which listing would you like to remove?',
            buttonLabel: 'Choose listing',
            rows: menu.map((m) => ({
              id: `del:${m.id}`,
              title: m.title,
              description: [m.city, m.status === 'pending' ? 'awaiting review' : null]
                .filter(Boolean)
                .join(' — '),
            })),
          })
        : false;
      if (!sentList) {
        await whatsappAdapter.sendText(message.senderId, deleteMenuMessage(menu));
      }
    } else if (outcome.action === 'delete_confirm_prompt') {
      const title = outcome.listingTitle ?? 'your listing';
      // Button ids are wired into the session state machine (confirm_delete /
      // cancel_delete); typed DELETE still works for clients without buttons.
      const sentButtons = rich
        ? await sendWhatsAppButtons(
            message.senderId,
            `You're about to remove "${title}" from Easy Rent.`,
            [
              // The confirm id carries the listing id: the session only
              // honors a tap bound to the CURRENTLY staged listing, so a
              // stale button from an earlier prompt can't archive the wrong one.
              { id: `confirm_delete:${outcome.listingId}`, title: 'Delete' },
              { id: 'cancel_delete', title: 'Cancel' },
            ]
          )
        : false;
      if (!sentButtons) {
        await whatsappAdapter.sendText(message.senderId, deleteConfirmMessage(title));
      }
    } else if (outcome.action === 'listing_deleted') {
      await whatsappAdapter.sendText(
        message.senderId,
        deleteDoneMessage(outcome.listingTitle ?? 'your listing')
      );
      await createNotificationsForOpsAndAdmin({
        type: 'whatsapp_intake',
        title: `Landlord removed listing #${outcome.listingId} via WhatsApp — archived, purges in 30 days`,
        link: `/dashboard/listings/${outcome.listingId}`,
      });
    } else if (outcome.action === 'command_cancelled') {
      await whatsappAdapter.sendText(message.senderId, deleteCancelledMessage());
    } else if (outcome.action === 'no_listings') {
      await whatsappAdapter.sendText(message.senderId, noListingsMessage());
    } else if (outcome.action === 'help') {
      await whatsappAdapter.sendText(message.senderId, helpMessage());
    } else if (outcome.action === 'link_reissue') {
      const links = await linksFor(message.senderId, outcome.listingId ?? null);
      // link_reissue means a listing EXISTS — when minting fails (legacy
      // listing, no landlord account) saying "you have no listings" is
      // factually wrong and alarming. Point at the listing instead — but only
      // an ACTIVE one is "live"; a pending one 404s for the unauthenticated.
      await whatsappAdapter.sendText(
        message.senderId,
        links
          ? linkReissuedMessage({ ...links, title: outcome.listingTitle })
          : outcome.listingStatus === 'active'
            ? listingLiveNoLinksMessage(
                outcome.listingTitle ?? null,
                `${publicBaseUrl}/listings/${outcome.listingId}`
              )
            : listingPendingNoLinksMessage(outcome.listingTitle ?? null)
      );
    } else if (outcome.action === 'attach_media') {
      // Photos after publish went onto the live listing — confirm to the
      // sender, and never stay silent when downloads failed.
      await whatsappAdapter.sendText(
        message.senderId,
        outcome.mediaStored > 0
          ? photosAddedMessage(
              outcome.listingTitle ?? 'your listing',
              outcome.mediaStored,
              outcome.mediaFailed,
              // When the checks are armed the photo is not visible yet, so
              // promising it was "added" would send them looking for it.
              { queued: Boolean(outcome.mediaQueued), overCap: outcome.mediaOverCap ?? 0 }
            )
          : photosFailedMessage()
      );
      if (outcome.mediaStored > 0) {
        await createNotificationsForOpsAndAdmin({
          type: 'whatsapp_intake',
          title: `${outcome.mediaStored} photo(s) added to listing #${outcome.listingId} via WhatsApp — spot-check`,
          link: `/dashboard/listings/${outcome.listingId}`,
        });
      }
    } else if (outcome.action === 'after_publish') {
      await createNotificationsForOpsAndAdmin({
        type: 'whatsapp_intake',
        title: `Sender replied after publish on intake #${outcome.intakeId} — may want changes`,
        link: '/back-office/whatsapp-intakes',
      });
    }

    // Failed downloads on ANY path are actionable: the sender believes those
    // photos were delivered.
    if (outcome.mediaFailed > 0 && outcome.action !== 'attach_media') {
      // Tell the sender too — previously only ops heard, and listings went
      // live missing photos the landlord was sure they had sent.
      if (outcome.action === 'created' || outcome.action === 'appended') {
        await whatsappAdapter.sendText(message.senderId, photosMissedMessage(outcome.mediaFailed));
      }
      await createNotificationsForOpsAndAdmin({
        type: 'whatsapp_intake',
        title: `${outcome.mediaFailed} photo download(s) failed for intake #${outcome.intakeId} — check logs`,
        link: '/back-office/whatsapp-intakes',
      });
    }
  }
}

/**
 * Mint fresh links for a sender, if they have an account. Returns null when
 * they don't (legacy Ops-owned listings), so the caller can fall back to the
 * manual ops path.
 */
async function linksFor(
  senderId: string,
  listingId: number | null
): Promise<{ viewUrl: string; editUrl: string; deleteUrl: string } | null> {
  try {
    const e164 = senderId.startsWith('+') ? senderId : `+${senderId}`;
    const user = await db.query.users.findFirst({
      where: and(eq(users.waPhone, e164), isNull(users.deletedAt)),
    });
    if (!user) return null;
    const landlord = await db.query.landlords.findFirst({ where: eq(landlords.userId, user.id) });
    if (!landlord) return null;
    const minted = await mintAccessLink({ userId: user.id, listingId, channel: 'whatsapp' });
    return { viewUrl: minted.viewUrl, editUrl: minted.editUrl, deleteUrl: minted.deleteUrl };
  } catch (err) {
    console.error('[webhook] link minting failed', err);
    return null;
  }
}
