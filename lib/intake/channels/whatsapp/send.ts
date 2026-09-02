import { GRAPH_API_BASE, whatsappConfig, isIntakeConfigured } from './config';

/**
 * POST one payload to the Cloud API messages endpoint — shared by every
 * outbound shape. Valid inside the 24-hour customer-service window opened by
 * the sender's own message — which is always the case for intake replies.
 * Logs and no-ops when unconfigured.
 */
async function postMessage(
  payload: Record<string, unknown>,
  dryRunLabel: string
): Promise<boolean> {
  if (!isIntakeConfigured()) {
    console.log(`[whatsapp:dryrun] ${dryRunLabel}`);
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
        body: JSON.stringify(payload),
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

/** Send a free-form text reply via the Cloud API. */
export async function sendWhatsAppText(
  to: string,
  body: string,
  options?: { previewUrl?: boolean }
): Promise<boolean> {
  const text: { body: string; preview_url?: boolean } = { body };
  if (options?.previewUrl !== undefined) text.preview_url = options.previewUrl;
  return postMessage(
    { messaging_product: 'whatsapp', to, type: 'text', text },
    `to=${to}: ${body}`
  );
}

/**
 * Mark an inbound message read (blue ticks); with opts.typing, also show the
 * typing indicator (auto-clears after ~25s or on our next message). Purely
 * cosmetic — a failure is harmless and needs no handling.
 */
export async function markWhatsAppRead(
  messageId: string,
  opts?: { typing?: boolean }
): Promise<boolean> {
  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  };
  if (opts?.typing) payload.typing_indicator = { type: 'text' };
  return postMessage(payload, `read message_id=${messageId}`);
}

/**
 * Truncate by code points, not UTF-16 units — String.slice can split an
 * emoji's surrogate pair, and a lone surrogate makes the JSON body malformed
 * Unicode that Graph rejects outright.
 */
const clip = (s: string, max: number): string => [...s].slice(0, max).join('');

/**
 * Interactive reply buttons. Cloud API caps — 3 buttons, 20-char titles — are
 * enforced by truncation, never by throwing.
 */
export async function sendWhatsAppButtons(
  to: string,
  body: string,
  buttons: Array<{ id: string; title: string }>
): Promise<boolean> {
  return postMessage(
    {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body },
        action: {
          buttons: buttons.slice(0, 3).map((button) => ({
            type: 'reply',
            reply: { id: button.id, title: clip(button.title, 20) },
          })),
        },
      },
    },
    `buttons to=${to}: ${body}`
  );
}

/**
 * Interactive list menu (single section). Cloud API caps — 10 rows, 24-char
 * titles, 72-char descriptions, 20-char button — are enforced by truncation.
 */
export async function sendWhatsAppList(
  to: string,
  args: {
    body: string;
    buttonLabel: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }
): Promise<boolean> {
  return postMessage(
    {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: args.body },
        action: {
          button: clip(args.buttonLabel, 20),
          sections: [
            {
              rows: args.rows.slice(0, 10).map((row) => ({
                id: row.id,
                title: clip(row.title, 24),
                // Graph rejects empty strings on optional fields — omit, don't send ''.
                ...(row.description ? { description: clip(row.description, 72) } : {}),
              })),
            },
          ],
        },
      },
    },
    `list to=${to}: ${args.body}`
  );
}

/** Call-to-action URL button — a tappable link instead of a raw URL in the bubble. */
export async function sendWhatsAppCtaUrl(
  to: string,
  args: { body: string; buttonText: string; url: string }
): Promise<boolean> {
  return postMessage(
    {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        body: { text: args.body },
        action: {
          name: 'cta_url',
          parameters: { display_text: args.buttonText, url: args.url },
        },
      },
    },
    `cta_url to=${to}: ${args.url}`
  );
}

/** Ask the sender to share a location via WhatsApp's native picker. */
export async function sendWhatsAppLocationRequest(
  to: string,
  body: string
): Promise<boolean> {
  return postMessage(
    {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'location_request_message',
        body: { text: body },
        action: { name: 'send_location' },
      },
    },
    `location_request to=${to}`
  );
}

/**
 * Send an APPROVED MESSAGE TEMPLATE.
 *
 * WHY THIS EXISTS SEPARATELY FROM `sendWhatsAppText`. Every other sender in
 * this file rides inside the 24-hour customer-service window that the
 * landlord's own message opened — intake replies, consent prompts, publish
 * notices all go out minutes after the landlord wrote to us. A SCHEDULED
 * message has no such window by definition: a weekly report lands six days
 * after anything the landlord said. Free-form text there is rejected outright
 * by Meta (error 131047), so a report sent with `sendWhatsAppText` would fail
 * for every recipient while looking, in the logs, exactly like a network blip.
 *
 * Business-initiated messaging is templates or nothing. The template itself
 * must be registered and approved in the WhatsApp Manager before a single one
 * can be delivered; `whatsappTemplateName()` reads the registered name from the
 * environment because code cannot invent one.
 *
 * NO FREE-FORM FALLBACK. It is tempting to retry as text when the template
 * send fails, the way the consent prompt falls back from buttons. That would be
 * wrong here: outside the window the fallback cannot succeed, and repeatedly
 * pushing unsolicited free-form messages at a number is what degrades a WABA's
 * quality rating. A failed report is dropped and reported to the caller.
 *
 * PARAMETERS CANNOT CONTAIN NEWLINES. Meta rejects a body parameter containing
 * a newline, a tab, or 5+ consecutive spaces — the layout has to live in the
 * approved template text, with the variables carrying only short scalar values.
 * `sanitizeTemplateParam` enforces that rather than trusting callers.
 */
export function whatsappTemplateName(kind: 'report'): string | null {
  if (kind === 'report') return process.env.WHATSAPP_REPORT_TEMPLATE ?? null;
  return null;
}

/** Language the templates were APPROVED under. Meta matches on this exactly. */
export function whatsappTemplateLanguage(): string {
  return process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? 'en';
}

/** Collapse anything Meta rejects in a body parameter into single spaces. */
export function sanitizeTemplateParam(value: string | number): string {
  const text = String(value).replace(/\s+/g, ' ').trim();
  return clip(text || '-', 240);
}

export async function sendWhatsAppTemplate(
  to: string,
  args: {
    name: string;
    languageCode?: string;
    /** Positional body variables, in {{1}}…{{n}} order. */
    bodyParams?: Array<string | number>;
    /** Suffix for a dynamic URL button, when the template declares one. */
    urlButtonParam?: string;
  }
): Promise<boolean> {
  const components: Array<Record<string, unknown>> = [];

  if (args.bodyParams?.length) {
    components.push({
      type: 'body',
      parameters: args.bodyParams.map((value) => ({
        type: 'text',
        text: sanitizeTemplateParam(value),
      })),
    });
  }

  if (args.urlButtonParam) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: sanitizeTemplateParam(args.urlButtonParam) }],
    });
  }

  return postMessage(
    {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: args.name,
        language: { code: args.languageCode ?? whatsappTemplateLanguage() },
        ...(components.length ? { components } : {}),
      },
    },
    `template ${args.name} to=${to}: [${(args.bodyParams ?? []).join(' | ')}]`
  );
}
