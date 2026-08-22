/**
 * Credentials and tunables for social auto-publish.
 *
 * Same dormancy contract as `lib/intake/channels/whatsapp/config.ts`: env is
 * read through lazy getters (so a missing var never throws at import time), and
 * `isConfigured()` returning false makes the adapter dry-run instead of fail.
 */

import { GRAPH_API_BASE } from '@/lib/intake/channels/whatsapp/config';

/** Meta's Graph API — the same base and version pin the WhatsApp intake uses. */
export { GRAPH_API_BASE };

export const TIKTOK_API_BASE = process.env.TIKTOK_API_BASE ?? 'https://open.tiktokapis.com/v2';

export const socialConfig = {
  get facebookPageId() {
    return process.env.FACEBOOK_PAGE_ID ?? '';
  },
  /**
   * Long-lived Page access token. Page tokens derived from a long-lived user
   * token do not expire on a timer, but they DO break when the admin changes
   * their password or revokes the app — which surfaces as Graph error 190.
   */
  get facebookPageAccessToken() {
    return process.env.FACEBOOK_PAGE_ACCESS_TOKEN ?? '';
  },
  /** IG Professional account id, linked to the Page above. */
  get instagramAccountId() {
    return process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID ?? '';
  },
  /**
   * OPTIONAL, and only ever used to READ the Page token's expiry via
   * `debug_token` — never to publish. Meta wants an app or app-developer token
   * for that call, so without these we fall back to asking with the Page token
   * itself, which Meta accepts in some app configurations and refuses in
   * others. Refusal costs us the expiry readout, nothing more.
   */
  get facebookAppId() {
    return process.env.FACEBOOK_APP_ID ?? '';
  },
  get facebookAppSecret() {
    return process.env.FACEBOOK_APP_SECRET ?? '';
  },
  get tiktokClientKey() {
    return process.env.TIKTOK_CLIENT_KEY ?? '';
  },
  get tiktokClientSecret() {
    return process.env.TIKTOK_CLIENT_SECRET ?? '';
  },
  /** Optional: where the Facebook Group paste-draft is pinged (E.164). */
  get opsWhatsApp() {
    return process.env.SOCIAL_OPS_WHATSAPP ?? '';
  },
};

export function baseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL || 'https://easyrent.lk';
}

export function isFacebookPageConfigured(): boolean {
  return Boolean(socialConfig.facebookPageId && socialConfig.facebookPageAccessToken);
}

/** Instagram publishes through the Page token, so it needs both. */
export function isInstagramConfigured(): boolean {
  return Boolean(socialConfig.instagramAccountId && socialConfig.facebookPageAccessToken);
}

export function isTikTokConfigured(): boolean {
  return Boolean(socialConfig.tiktokClientKey && socialConfig.tiktokClientSecret);
}

// --- worker tunables -------------------------------------------------------
// Same shape as lib/moderation/config.ts: env-overridable, sane defaults.

export const SOCIAL_BATCH_SIZE = Number(process.env.SOCIAL_BATCH_SIZE ?? 4);
export const SOCIAL_RUN_BUDGET_MS = Number(process.env.SOCIAL_RUN_BUDGET_MS ?? 45_000);
/** After this many tries a row is parked as `failed` and ops are told once. */
export const SOCIAL_MAX_ATTEMPTS = 3;
/** How long a claimed row stays claimed before another run may steal it. */
export const SOCIAL_LEASE_MINUTES = 5;
/** Per-HTTP-call ceiling. Meta image ingestion is the slow part. */
export const SOCIAL_HTTP_TIMEOUT_MS = 20_000;

/**
 * The canvas every social image is normalised to: 1080×1350 (4:5).
 *
 * Instagram rejects anything outside 4:5–1.91:1, AND applies the FIRST image's
 * aspect ratio to every slide of a carousel. Without a single fixed canvas the
 * publish either fails outright or silently crops the other photos.
 */
export const SOCIAL_IMAGE_WIDTH = 1080;
export const SOCIAL_IMAGE_HEIGHT = 1350;
/** Brand dark — the letterbox behind a photo that does not fill the canvas. */
export const SOCIAL_IMAGE_BACKGROUND = { r: 6, g: 44, b: 43, alpha: 1 };
export const SOCIAL_IMAGE_QUALITY = 88;
