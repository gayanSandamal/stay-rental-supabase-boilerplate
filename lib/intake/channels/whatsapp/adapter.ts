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

  /** Walk the Cloud API envelope; only text and image messages become intakes. */
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
          } else {
            continue; // stickers, reactions, locations, system events…
          }

          out.push({
            channel: 'whatsapp',
            senderId: from,
            senderName,
            messageId: String(message.id ?? ''),
            text,
            mediaIds,
            unsupportedMedia,
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
