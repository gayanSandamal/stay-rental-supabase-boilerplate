import { GRAPH_API_BASE, whatsappConfig, isIntakeConfigured } from './config';

/**
 * Send a free-form text reply via the Cloud API. Valid inside the 24-hour
 * customer-service window opened by the sender's own message — which is
 * always the case for intake replies. Logs and no-ops when unconfigured.
 */
export async function sendWhatsAppText(to: string, body: string): Promise<boolean> {
  if (!isIntakeConfigured()) {
    console.log(`[whatsapp:dryrun] to=${to}: ${body}`);
    return false;
  }

  try {
    const res = await fetch(
      `${GRAPH_API_BASE}/${whatsappConfig.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${whatsappConfig.accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body },
        }),
        signal: AbortSignal.timeout(8_000),
      }
    );

    if (!res.ok) {
      // Includes out-of-24h-window rejections (error 131047) — the caller
      // surfaces the failure to ops rather than assuming delivery.
      console.error('WhatsApp send failed', res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    // A network throw must never take down the pipeline mid-publish.
    console.error('WhatsApp send error', err);
    return false;
  }
}
