/**
 * WhatsApp Business Cloud API configuration. The intake pipeline is dormant
 * unless every required var is present — the webhook 503s and the cron no-ops,
 * so the feature can ship before Meta business verification completes.
 */
export const whatsappConfig = {
  get verifyToken() {
    return process.env.WHATSAPP_VERIFY_TOKEN ?? null;
  },
  get appSecret() {
    return process.env.WHATSAPP_APP_SECRET ?? null;
  },
  get accessToken() {
    return process.env.WHATSAPP_ACCESS_TOKEN ?? null;
  },
  get phoneNumberId() {
    return process.env.WHATSAPP_PHONE_NUMBER_ID ?? null;
  },
};

export function isIntakeConfigured(): boolean {
  return !!(
    whatsappConfig.verifyToken &&
    whatsappConfig.appSecret &&
    whatsappConfig.accessToken &&
    whatsappConfig.phoneNumberId
  );
}

/** Test seam (like INTAKE_SETTLE_MS): lets e2e point media/send at a mock Graph server. Never set in prod. */
export const GRAPH_API_BASE =
  process.env.WHATSAPP_GRAPH_API_BASE ?? 'https://graph.facebook.com/v21.0';
