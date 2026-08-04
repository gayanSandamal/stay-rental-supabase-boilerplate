import crypto from 'node:crypto';
import type {
  ChallengeResult,
  ChannelAdapter,
  NormalizedInboundMessage,
} from '../types';
import { whatsappConfig, isIntakeConfigured } from './config';
import { persistWhatsAppMedia } from './media';
import { sendWhatsAppText } from './send';

/**
 * WhatsApp Business Cloud API adapter — the reference ChannelAdapter
 * implementation. All Meta-specific wire concerns live here; the pipeline
 * core never sees a Cloud API payload.
 */
export const whatsappAdapter: ChannelAdapter = {
  channel: 'whatsapp',

  isConfigured: isIntakeConfigured,

  /** Meta subscribe handshake: echo hub.challenge when the verify token matches. */
  verifyWebhookChallenge(params: URLSearchParams): ChallengeResult {
    if (
      whatsappConfig.verifyToken &&
      params.get('hub.mode') === 'subscribe' &&
      params.get('hub.verify_token') === whatsappConfig.verifyToken
    ) {
      return { handled: true, status: 200, body: params.get('hub.challenge') ?? '' };
    }
    return { handled: true, status: 403, body: '' };
  },

  /** X-Hub-Signature-256: HMAC-SHA256 of the raw body with the app secret. */
  verifySignature(rawBody: string, headers: Headers): boolean {
    if (!whatsappConfig.appSecret) return false;
    const signature = headers.get('x-hub-signature-256') ?? '';
    const expected =
      'sha256=' +
      crypto.createHmac('sha256', whatsappConfig.appSecret).update(rawBody).digest('hex');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
  },

  /** Walk the Cloud API envelope; text, image, interactive-reply and location messages survive. */
  normalizeInbound(payload: unknown): NormalizedInboundMessage[] {
    const out: NormalizedInboundMessage[] = [];
    const body = payload as any;

    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value;
        const senderName: string | null = value?.contacts?.[0]?.profile?.name ?? null;

        for (const message of value?.messages ?? []) {
          const from: string | undefined = message?.from;
          if (!from) continue;

          let text: string | null = null;
          const mediaIds: string[] = [];
          let unsupportedMedia = false;
          let interactiveReplyId: string | undefined;
          let location: NormalizedInboundMessage['location'];

          if (message.type === 'text') {
            text = message.text?.body ?? null;
          } else if (message.type === 'image') {
            if (message.image?.id) mediaIds.push(String(message.image.id));
            text = message.image?.caption ?? null;
          } else if (message.type === 'document') {
            // "Send as file" photos (common, preserves quality) are still
            // images — same Graph media id, same download path.
            text = message.document?.caption ?? null;
            if (
              message.document?.id &&
              /^image\//.test(String(message.document?.mime_type ?? ''))
            ) {
              mediaIds.push(String(message.document.id));
            } else {
              unsupportedMedia = true;
            }
          } else if (message.type === 'video' || message.type === 'audio') {
            // Keep the caption (video captions often hold the whole listing),
            // flag the media so the sender is told to resend as photos.
            text = message.video?.caption ?? null;
            unsupportedMedia = true;
          } else if (message.type === 'interactive') {
            // Button tap or list pick. text = the title the sender saw on
            // screen (so text-based parsing still reads naturally), the id is
            // what flows branch on.
            const reply =
              message.interactive?.button_reply ?? message.interactive?.list_reply;
            if (!reply?.id) continue; // flow/nfm replies — nothing the pipeline understands
            interactiveReplyId = String(reply.id);
            text = reply.title != null ? String(reply.title) : null;
          } else if (message.type === 'location') {
            const latitude = Number(message.location?.latitude);
            const longitude = Number(message.location?.longitude);
            // Range-check, not just finiteness: coordinates land in
            // numeric(10,8)/numeric(11,8) columns, and an out-of-range value
            // from a non-official client would overflow → 500 → Meta retry
            // storm. Strings are capped — they end up in listing addresses.
            if (
              !Number.isFinite(latitude) ||
              !Number.isFinite(longitude) ||
              Math.abs(latitude) > 90 ||
              Math.abs(longitude) > 180
            ) {
              continue;
            }
            location = {
              latitude,
              longitude,
              ...(message.location?.name
                ? { name: String(message.location.name).slice(0, 300) }
                : {}),
              ...(message.location?.address
                ? { address: String(message.location.address).slice(0, 300) }
                : {}),
            };
            text = ''; // empty, not null — a pin is content, just not prose
          } else {
            continue; // stickers, reactions, system events…
          }

          out.push({
            channel: 'whatsapp',
            senderId: from,
            senderName,
            messageId: String(message.id ?? ''),
            text,
            mediaIds,
            unsupportedMedia,
            interactiveReplyId,
            location,
            timestamp: message.timestamp
              ? new Date(Number(message.timestamp) * 1000)
              : new Date(),
          });
        }
      }
    }
    return out;
  },

  persistMedia: persistWhatsAppMedia,

  sendText: sendWhatsAppText,
};
