/**
 * Channel adapter contract for the listing-intake pipeline. The core pipeline
 * (lib/intake/session.ts, lib/intake/process.ts) is channel-agnostic; each
 * messaging channel (WhatsApp today; Telegram, iMessage… later) provides one
 * adapter plus one thin webhook route that delegates to it.
 */

export type IntakeChannel = 'whatsapp' | 'telegram' | 'imessage';

export interface NormalizedInboundMessage {
  channel: IntakeChannel;
  /** Provider-scoped stable sender id (WhatsApp: digits-only wa_id). */
  senderId: string;
  /** Sender display name (WhatsApp: profile push-name), when the provider shares it. */
  senderName: string | null;
  /** Provider message id — the idempotency key against webhook redelivery. */
  messageId: string;
  text: string | null;
  /** Provider media ids; resolve via persistMedia at webhook time. */
  mediaIds: string[];
  /**
   * The message carried media the pipeline can't ingest (video, voice note,
   * non-image document). A session must still exist so the sender can be told
   * to resend as photos — silence is never acceptable.
   */
  unsupportedMedia?: boolean;
  timestamp: Date;
}

export interface ChallengeResult {
  /** false → this channel has no GET verification handshake. */
  handled: boolean;
  status: number;
  body: string;
}

export interface ChannelAdapter {
  readonly channel: IntakeChannel;

  /** All provider env vars present? The single source of fail-closed dormancy. */
  isConfigured(): boolean;

  /** GET verification handshake (Meta echoes hub.challenge). */
  verifyWebhookChallenge(params: URLSearchParams): ChallengeResult;

  /** Timing-safe signature check over the RAW request body. */
  verifySignature(rawBody: string, headers: Headers): boolean;

  /** Provider webhook payload → normalized messages ([] when nothing usable). */
  normalizeInbound(payload: unknown): NormalizedInboundMessage[];

  /**
   * Download provider media and persist it to Supabase storage. MUST be called
   * from the webhook, not the processing cron — provider media URLs expire in
   * minutes (Meta). Returns the public URL, or null on failure (photos are
   * optional at intake time).
   */
  persistMedia(mediaId: string): Promise<string | null>;

  /** Plain-text reply to a sender. Dry-run logs when unconfigured. */
  sendText(senderId: string, body: string): Promise<boolean>;
}
