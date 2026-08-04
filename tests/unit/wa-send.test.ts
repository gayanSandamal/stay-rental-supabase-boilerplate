import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  markWhatsAppRead,
  sendWhatsAppButtons,
  sendWhatsAppCtaUrl,
  sendWhatsAppList,
  sendWhatsAppLocationRequest,
  sendWhatsAppText,
} from '@/lib/intake/channels/whatsapp/send';

const ENV_KEYS = [
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
] as const;

const originalEnv: Record<string, string | undefined> = {};
const originalFetch = global.fetch;

beforeEach(() => {
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
  process.env.WHATSAPP_VERIFY_TOKEN = 'verify';
  process.env.WHATSAPP_APP_SECRET = 'secret';
  process.env.WHATSAPP_ACCESS_TOKEN = 'test-token';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '111222333';
  // Keep expected failure paths (500s, dry-runs) out of the test output.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

/** Mock global fetch, capturing each call's URL, parsed JSON body and headers. */
function captureFetch(status = 200) {
  const calls: Array<{ url: string; body: any; headers: any }> = [];
  global.fetch = vi.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), body: JSON.parse(init.body), headers: init.headers });
    return new Response(
      status === 200 ? '{"messages":[{"id":"wamid.OUT"}]}' : '{"error":{"code":100}}',
      { status }
    );
  }) as any;
  return calls;
}

describe('sendWhatsAppText', () => {
  it('posts the plain text payload unchanged (no preview_url key when options omitted)', async () => {
    const calls = captureFetch();
    expect(await sendWhatsAppText('94771234567', 'hello')).toBe(true);

    const [call] = calls;
    expect(call.url).toBe('https://graph.facebook.com/v21.0/111222333/messages');
    expect(call.headers.authorization).toBe('Bearer test-token');
    expect(call.body).toEqual({
      messaging_product: 'whatsapp',
      to: '94771234567',
      type: 'text',
      text: { body: 'hello' },
    });
  });

  it('sets text.preview_url when previewUrl is passed', async () => {
    const calls = captureFetch();
    await sendWhatsAppText('94771234567', 'see https://easyrent.lk', { previewUrl: true });
    expect(calls[0].body.text).toEqual({
      body: 'see https://easyrent.lk',
      preview_url: true,
    });
  });

  it('returns false on a 500 without throwing', async () => {
    captureFetch(500);
    expect(await sendWhatsAppText('94771234567', 'hello')).toBe(false);
  });

  it('returns false and never touches the network when unconfigured', async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    const calls = captureFetch();
    expect(await sendWhatsAppText('94771234567', 'hello')).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe('markWhatsAppRead', () => {
  it('posts a read status for the message id', async () => {
    const calls = captureFetch();
    expect(await markWhatsAppRead('wamid.IN')).toBe(true);
    expect(calls[0].body).toEqual({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: 'wamid.IN',
    });
  });

  it('adds the typing indicator when asked', async () => {
    const calls = captureFetch();
    await markWhatsAppRead('wamid.IN', { typing: true });
    expect(calls[0].body).toEqual({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: 'wamid.IN',
      typing_indicator: { type: 'text' },
    });
  });

  it('is harmless on failure — false, no throw', async () => {
    captureFetch(500);
    expect(await markWhatsAppRead('wamid.IN', { typing: true })).toBe(false);
  });
});

describe('sendWhatsAppButtons', () => {
  it('posts the interactive button payload', async () => {
    const calls = captureFetch();
    expect(
      await sendWhatsAppButtons('94771234567', 'Publish this listing?', [
        { id: 'publish_yes', title: 'Yes, publish' },
        { id: 'publish_no', title: 'Not yet' },
      ])
    ).toBe(true);

    expect(calls[0].body).toEqual({
      messaging_product: 'whatsapp',
      to: '94771234567',
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: 'Publish this listing?' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'publish_yes', title: 'Yes, publish' } },
            { type: 'reply', reply: { id: 'publish_no', title: 'Not yet' } },
          ],
        },
      },
    });
  });

  it('truncates to 3 buttons and 20-char titles instead of throwing', async () => {
    const calls = captureFetch();
    await sendWhatsAppButtons('94771234567', 'Pick one', [
      { id: 'a', title: 'This title is definitely longer than twenty characters' },
      { id: 'b', title: 'B' },
      { id: 'c', title: 'C' },
      { id: 'd', title: 'D' },
    ]);

    const { buttons } = calls[0].body.interactive.action;
    expect(buttons).toHaveLength(3);
    expect(buttons[0].reply.title).toBe('This title is defini');
    expect(buttons[0].reply.title).toHaveLength(20);
    expect(buttons.map((b: any) => b.reply.id)).toEqual(['a', 'b', 'c']);
  });

  it('never splits a surrogate pair when truncating — Graph rejects lone surrogates', async () => {
    const calls = captureFetch();
    // 19 ASCII chars + 🏠 (2 UTF-16 units) = 21 units; a naive slice(0, 20)
    // would cut between the surrogates.
    await sendWhatsAppButtons('94771234567', 'Pick', [
      { id: 'a', title: 'Beautiful Colombo 5🏠extra' },
    ]);
    const title = calls[0].body.interactive.action.buttons[0].reply.title;
    expect(title).toBe('Beautiful Colombo 5🏠');
    // Round-trippable through JSON without a lone \ud83c escape.
    expect(JSON.parse(JSON.stringify(title))).toBe(title);
  });
});

describe('sendWhatsAppList', () => {
  it('posts the interactive list payload with a single section', async () => {
    const calls = captureFetch();
    expect(
      await sendWhatsAppList('94771234567', {
        body: 'Which listing?',
        buttonLabel: 'My listings',
        rows: [
          { id: 'listing_1', title: '3BR house in Kandy', description: 'LKR 85,000/month' },
          { id: 'listing_2', title: 'Annex in Nugegoda' },
        ],
      })
    ).toBe(true);

    expect(calls[0].body).toEqual({
      messaging_product: 'whatsapp',
      to: '94771234567',
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: 'Which listing?' },
        action: {
          button: 'My listings',
          sections: [
            {
              rows: [
                {
                  id: 'listing_1',
                  title: '3BR house in Kandy',
                  description: 'LKR 85,000/month',
                },
                { id: 'listing_2', title: 'Annex in Nugegoda' },
              ],
            },
          ],
        },
      },
    });
  });

  it('truncates to 10 rows, 24-char titles and 72-char descriptions', async () => {
    const calls = captureFetch();
    const rows = Array.from({ length: 12 }, (_, i) => ({
      id: `row_${i}`,
      title: `Row ${i} with a title far beyond twenty-four characters`,
      description: 'd'.repeat(100),
    }));
    await sendWhatsAppList('94771234567', {
      body: 'Pick',
      buttonLabel: 'A button label longer than twenty chars',
      rows,
    });

    const { action } = calls[0].body.interactive;
    expect(action.button).toHaveLength(20);
    expect(action.sections[0].rows).toHaveLength(10);
    for (const row of action.sections[0].rows) {
      expect(row.title.length).toBeLessThanOrEqual(24);
      expect(row.description).toHaveLength(72);
    }
  });
});

describe('sendWhatsAppCtaUrl', () => {
  it('posts the cta_url payload', async () => {
    const calls = captureFetch();
    expect(
      await sendWhatsAppCtaUrl('94771234567', {
        body: 'Your listing is live!',
        buttonText: 'View listing',
        url: 'https://easyrent.lk/listings/42',
      })
    ).toBe(true);

    expect(calls[0].body).toEqual({
      messaging_product: 'whatsapp',
      to: '94771234567',
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        body: { text: 'Your listing is live!' },
        action: {
          name: 'cta_url',
          parameters: {
            display_text: 'View listing',
            url: 'https://easyrent.lk/listings/42',
          },
        },
      },
    });
  });
});

describe('sendWhatsAppLocationRequest', () => {
  it('posts the location_request_message payload', async () => {
    const calls = captureFetch();
    expect(
      await sendWhatsAppLocationRequest('94771234567', 'Share the property location')
    ).toBe(true);

    expect(calls[0].body).toEqual({
      messaging_product: 'whatsapp',
      to: '94771234567',
      type: 'interactive',
      interactive: {
        type: 'location_request_message',
        body: { text: 'Share the property location' },
        action: { name: 'send_location' },
      },
    });
  });

  it('returns false on a 500', async () => {
    captureFetch(500);
    expect(await sendWhatsAppLocationRequest('94771234567', 'Share it')).toBe(false);
  });
});
