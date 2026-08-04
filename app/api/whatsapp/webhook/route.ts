import { NextRequest, NextResponse } from 'next/server';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { whatsappAdapter } from '@/lib/intake/channels/whatsapp/adapter';
import { appendToIntake } from '@/lib/intake/session';
import {
  deleteCancelledMessage,
  deleteConfirmMessage,
  deleteDoneMessage,
  deleteMenuMessage,
  editLinkMessage,
  helpMessage,
  linkReissuedMessage,
  noListingsMessage,
  photosAddedMessage,
  photosFailedMessage,
} from '@/lib/intake/messages';
import { mintAccessLink } from '@/lib/auth/access-links';
import { db } from '@/lib/db/drizzle';
import { landlords, users } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { createNotificationsForOpsAndAdmin } from '@/lib/notifications';

export const dynamic = 'force-dynamic';
// Multi-photo albums mean several 2-hop Graph downloads per POST — the plan
// default (10s) would 504 to Meta and trigger a retry storm.
export const maxDuration = 60;

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

  for (const message of whatsappAdapter.normalizeInbound(payload)) {
    // Session write + redelivery dedup happen BEFORE media download inside
    // appendToIntake; media resolves via this callback only for new messages.
    const outcome = await appendToIntake(message, whatsappAdapter.persistMedia);

    if (outcome.action === 'edit_link') {
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
      await whatsappAdapter.sendText(message.senderId, deleteMenuMessage(outcome.menu ?? []));
    } else if (outcome.action === 'delete_confirm_prompt') {
      await whatsappAdapter.sendText(
        message.senderId,
        deleteConfirmMessage(outcome.listingTitle ?? 'your listing')
      );
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
      await whatsappAdapter.sendText(
        message.senderId,
        links
          ? linkReissuedMessage({ ...links, title: outcome.listingTitle })
          : noListingsMessage()
      );
    } else if (outcome.action === 'attach_media') {
      // Photos after publish went straight onto the live listing — confirm to
      // the sender, and never stay silent when downloads failed.
      await whatsappAdapter.sendText(
        message.senderId,
        outcome.mediaStored > 0
          ? photosAddedMessage(outcome.listingTitle ?? 'your listing', outcome.mediaStored, outcome.mediaFailed)
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
      await createNotificationsForOpsAndAdmin({
        type: 'whatsapp_intake',
        title: `${outcome.mediaFailed} photo download(s) failed for intake #${outcome.intakeId} — check logs`,
        link: '/back-office/whatsapp-intakes',
      });
    }
  }

  return NextResponse.json({ ok: true });
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
