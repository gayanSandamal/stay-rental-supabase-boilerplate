/**
 * SiliconFlow (OpenAI-compatible chat completions) transport.
 *
 * Adds what lib/intake/parser/llm-parser.ts lacks: a FRESH AbortSignal per
 * attempt (signals are single-use — see channels/whatsapp/media.ts), one retry
 * on transient failures only, and tolerant JSON extraction.
 */

import { MODERATION_API_BASE, MODERATION_TIMEOUT_MS, moderationApiKey } from './config';

export interface ChatImage {
  /** Raw image bytes; sent as a base64 data URL. */
  buffer: Buffer;
  mimeType: string;
}

export interface ChatCallResult<T> {
  data: T | null;
  usage: { inputTokens: number; outputTokens: number };
  /** Transport/parse failure. Null on success. */
  error: string | null;
  raw?: string;
}

/** Retry only on transient conditions: a 400 means our request is wrong. */
function isRetryable(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

/**
 * Extract a JSON object from a model reply. Models wrap JSON in prose or code
 * fences often enough that a bare JSON.parse is a reliability bug.
 */
export function extractJson<T>(text: string): T | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

export async function chatJson<T>(opts: {
  model: string;
  system: string;
  user: string;
  images?: ChatImage[];
  maxTokens?: number;
}): Promise<ChatCallResult<T>> {
  const apiKey = moderationApiKey();
  if (!apiKey) return { data: null, usage: { inputTokens: 0, outputTokens: 0 }, error: 'not_configured' };

  const content: unknown[] = [];
  for (const img of opts.images ?? []) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:${img.mimeType};base64,${img.buffer.toString('base64')}` },
    });
  }
  content.push({ type: 'text', text: opts.user });

  const body = JSON.stringify({
    model: opts.model,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content },
    ],
    max_tokens: opts.maxTokens ?? 500,
    // Deterministic-ish: this is a classifier, not a writer.
    temperature: 0,
    response_format: { type: 'json_object' },
  });

  let lastError = 'unknown';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${MODERATION_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body,
        signal: AbortSignal.timeout(MODERATION_TIMEOUT_MS),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        lastError = `http_${res.status}: ${text.slice(0, 200)}`;
        console.error('[moderation] provider error', res.status, text.slice(0, 300));
        if (!isRetryable(res.status) || attempt === 1) {
          return { data: null, usage: { inputTokens: 0, outputTokens: 0 }, error: lastError };
        }
      } else {
        const json: any = await res.json();
        const usage = {
          inputTokens: json?.usage?.prompt_tokens ?? 0,
          outputTokens: json?.usage?.completion_tokens ?? 0,
        };
        const choice = json?.choices?.[0];
        const raw: string = choice?.message?.content ?? '';
        const parsed = extractJson<T>(raw);
        if (!parsed) {
          lastError = `unparseable_response`;
          console.error('[moderation] unparseable reply', raw.slice(0, 300));
          if (attempt === 1) return { data: null, usage, error: lastError, raw };
        } else {
          return { data: parsed, usage, error: null, raw };
        }
      }
    } catch (err: any) {
      lastError = err?.name === 'TimeoutError' ? 'timeout' : `network: ${err?.message ?? 'error'}`;
      console.error('[moderation] request failed', lastError);
      if (attempt === 1) {
        return { data: null, usage: { inputTokens: 0, outputTokens: 0 }, error: lastError };
      }
    }
    await new Promise((r) => setTimeout(r, 800));
  }

  return { data: null, usage: { inputTokens: 0, outputTokens: 0 }, error: lastError };
}
