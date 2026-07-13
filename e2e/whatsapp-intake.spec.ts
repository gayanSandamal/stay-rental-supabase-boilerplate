import { test, expect } from '@playwright/test';
import crypto from 'node:crypto';

/**
 * WhatsApp intake pipeline — deterministic plumbing tests using simulated
 * Cloud API payloads (no Meta account needed). Requires the target to run
 * with WHATSAPP_* test values + CRON_SECRET; skips otherwise.
 *
 * Parsing is rule-based and in-process (lib/intake/parser) — no API key
 * needed. The full parse→publish path is asserted when the target runs with
 * INTAKE_SETTLE_MS=0 (test seam that disables the 10-min settle window);
 * otherwise the settle window keeps fresh intakes queued and only the
 * plumbing is asserted.
 */
const APP_SECRET = process.env.WHATSAPP_APP_SECRET;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const CRON_SECRET = process.env.CRON_SECRET;
const NO_SETTLE = process.env.INTAKE_SETTLE_MS === '0';

function sign(body: string): string {
  return 'sha256=' + crypto.createHmac('sha256', APP_SECRET!).update(body).digest('hex');
}

function webhookPayload(from: string, text: string, msgId: string) {
  return JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [{ profile: { name: 'E2E Landlord' }, wa_id: from }],
              messages: [
                { from, id: msgId, type: 'text', text: { body: text } },
              ],
            },
          },
        ],
      },
    ],
  });
}

async function postSigned(request: any, body: string) {
  return request.post('/api/whatsapp/webhook', {
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': sign(body),
    },
    data: body,
  });
}

async function runCron(request: any) {
  return request.get('/api/cron/process-whatsapp-intakes', {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
}

test.describe.serial('WhatsApp intake pipeline (mutating)', () => {
  test.skip(
    !APP_SECRET || !VERIFY_TOKEN || !CRON_SECRET,
    'WHATSAPP_APP_SECRET/VERIFY_TOKEN + CRON_SECRET required on target'
  );
  test.skip(!process.env.ALLOW_MUTATION, 'Set ALLOW_MUTATION=1');

  const FROM = `9477${String(Date.now()).slice(-7)}`;

  test('GET webhook echoes hub.challenge on valid verify token', async ({ request }) => {
    const resp = await request.get(
      `/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(
        VERIFY_TOKEN!
      )}&hub.challenge=e2e-challenge-123`
    );
    expect(resp.status()).toBe(200);
    expect(await resp.text()).toBe('e2e-challenge-123');
  });

  test('GET webhook rejects a wrong verify token', async ({ request }) => {
    const resp = await request.get(
      '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=x'
    );
    expect(resp.status()).toBe(403);
  });

  test('POST webhook rejects an invalid signature', async ({ request }) => {
    const body = webhookPayload(FROM, 'test', 'wamid.bad');
    const resp = await request.post('/api/whatsapp/webhook', {
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': 'sha256=' + '0'.repeat(64),
      },
      data: body,
    });
    expect(resp.status()).toBe(401);
  });

  test('POST webhook stores a correctly signed intake', async ({ request }) => {
    const body = webhookPayload(
      FROM,
      'Hi! 2 bedroom house at 12 E2E Lane, Nugegoda for 80000 per month. E2E intake test.',
      `wamid.e2e.${Date.now()}`
    );
    const resp = await postSigned(request, body);
    expect(resp.status()).toBe(200);
    expect((await resp.json()).ok).toBe(true);
  });

  test('cron requires the bearer secret (fails closed)', async ({ request }) => {
    const resp = await request.get('/api/cron/process-whatsapp-intakes');
    expect(resp.status()).toBe(401);
  });

  test('cron processes the intake into the expected state', async ({ request }) => {
    // Without INTAKE_SETTLE_MS=0 on the target, the 10-min settle window keeps
    // the fresh intake queued — this then only asserts the endpoint runs
    // cleanly and reports counts. With the seam active, the complete message
    // stored above must rule-parse and publish.
    const resp = await runCron(request);
    expect(resp.status()).toBe(200);
    const data = await resp.json();
    expect(data.ok).toBe(true);
    expect(typeof data.processed).toBe('number');
    if (NO_SETTLE) {
      expect(data.processed).toBeGreaterThanOrEqual(1);
      expect(data.published).toBeGreaterThanOrEqual(1);
    }
  });

  test('incomplete intake goes needs_info, not manual_review', async ({ request }) => {
    test.skip(!NO_SETTLE, 'Needs INTAKE_SETTLE_MS=0 on the target');
    // Different sender → its own intake session. No address/city/rent, so the
    // rule parser reports missing fields and the cron must ask the sender
    // (needs_info) instead of parking it for ops. The reply is a dry-run
    // console log while WHATSAPP_* points at test values — no Meta call.
    const from = `9476${String(Date.now()).slice(-7)}`;
    const body = webhookPayload(
      from,
      'House for rent, 2 bedrooms. E2E needs-info test.',
      `wamid.e2e.needsinfo.${Date.now()}`
    );
    const stored = await postSigned(request, body);
    expect(stored.status()).toBe(200);

    const resp = await runCron(request);
    expect(resp.status()).toBe(200);
    const data = await resp.json();
    expect(data.needsInfo).toBeGreaterThanOrEqual(1);
  });
});
