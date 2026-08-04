import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractJson } from '@/lib/moderation/client';

describe('extractJson', () => {
  it('parses a bare JSON object', () => {
    expect(extractJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it('unwraps a fenced code block', () => {
    expect(extractJson('```json\n{"unsafe":false}\n```')).toEqual({ unsafe: false });
    expect(extractJson('```\n{"unsafe":true}\n```')).toEqual({ unsafe: true });
  });

  it('digs the object out of surrounding prose', () => {
    // Models do this constantly; a bare JSON.parse would be a reliability bug.
    expect(extractJson('Sure! Here is the result:\n{"person_visible":true}\nHope that helps.')).toEqual({
      person_visible: true,
    });
  });

  it('handles nested objects and arrays', () => {
    expect(
      extractJson('{"faces":[{"bbox_2d":[1,2,3,4]}],"notes":null}')
    ).toEqual({ faces: [{ bbox_2d: [1, 2, 3, 4] }], notes: null });
  });

  it('returns null for junk rather than throwing', () => {
    expect(extractJson('')).toBeNull();
    expect(extractJson('no json here')).toBeNull();
    expect(extractJson('{ broken json')).toBeNull();
    expect(extractJson('}{')).toBeNull();
  });
});

describe('chatJson transport', () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.SILICONFLOW_API_KEY;

  beforeEach(() => {
    process.env.SILICONFLOW_API_KEY = 'test-key';
    vi.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.SILICONFLOW_API_KEY;
    else process.env.SILICONFLOW_API_KEY = originalKey;
    vi.restoreAllMocks();
  });

  const reply = (content: string, usage = { prompt_tokens: 100, completion_tokens: 20 }) =>
    new Response(JSON.stringify({ choices: [{ message: { content } }], usage }), { status: 200 });

  it('sends an OpenAI-compatible payload with the image as a data URL', async () => {
    const calls: Array<{ url: string; body: any; headers: any }> = [];
    global.fetch = vi.fn(async (url: any, init: any) => {
      calls.push({ url: String(url), body: JSON.parse(init.body), headers: init.headers });
      return reply('{"ok":true}');
    }) as any;

    const { chatJson } = await import('@/lib/moderation/client');
    const res = await chatJson<{ ok: boolean }>({
      model: 'Qwen/Qwen3-VL-8B-Instruct',
      system: 'sys',
      user: 'usr',
      images: [{ buffer: Buffer.from([0xff, 0xd8, 0xff]), mimeType: 'image/jpeg' }],
    });

    expect(res.data).toEqual({ ok: true });
    expect(res.error).toBeNull();
    expect(res.usage).toEqual({ inputTokens: 100, outputTokens: 20 });

    const [call] = calls;
    expect(call.url).toContain('/chat/completions');
    expect(call.headers.authorization).toBe('Bearer test-key');
    expect(call.body.model).toBe('Qwen/Qwen3-VL-8B-Instruct');
    expect(call.body.temperature).toBe(0);
    expect(call.body.messages[0]).toEqual({ role: 'system', content: 'sys' });
    const parts = call.body.messages[1].content;
    expect(parts[0].type).toBe('image_url');
    expect(parts[0].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
    expect(parts[1]).toEqual({ type: 'text', text: 'usr' });
  });

  it('returns not_configured without a key and never calls the network', async () => {
    delete process.env.SILICONFLOW_API_KEY;
    delete process.env.MODERATION_API_KEY;
    const spy = vi.fn();
    global.fetch = spy as any;

    const { chatJson } = await import('@/lib/moderation/client');
    const res = await chatJson({ model: 'm', system: 's', user: 'u' });

    expect(res.error).toBe('not_configured');
    expect(spy).not.toHaveBeenCalled();
  });

  it('retries once on a 429 and succeeds', async () => {
    let n = 0;
    global.fetch = vi.fn(async () => {
      n++;
      return n === 1 ? new Response('slow down', { status: 429 }) : reply('{"ok":1}');
    }) as any;

    const { chatJson } = await import('@/lib/moderation/client');
    const res = await chatJson<{ ok: number }>({ model: 'm', system: 's', user: 'u' });

    expect(n).toBe(2);
    expect(res.data).toEqual({ ok: 1 });
  });

  it('does NOT retry a 400 — a bad request will not fix itself', async () => {
    let n = 0;
    global.fetch = vi.fn(async () => {
      n++;
      return new Response('model not found', { status: 400 });
    }) as any;

    const { chatJson } = await import('@/lib/moderation/client');
    const res = await chatJson({ model: 'typo-model', system: 's', user: 'u' });

    expect(n).toBe(1);
    expect(res.error).toContain('http_400');
    expect(res.error).toContain('model not found');
  });

  it('retries an unparseable reply, then reports it', async () => {
    let n = 0;
    global.fetch = vi.fn(async () => {
      n++;
      return reply('I cannot help with that.');
    }) as any;

    const { chatJson } = await import('@/lib/moderation/client');
    const res = await chatJson({ model: 'm', system: 's', user: 'u' });

    expect(n).toBe(2);
    expect(res.error).toBe('unparseable_response');
    expect(res.data).toBeNull();
  });

  it('surfaces a network failure as an error rather than throwing', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('ECONNRESET');
    }) as any;

    const { chatJson } = await import('@/lib/moderation/client');
    const res = await chatJson({ model: 'm', system: 's', user: 'u' });

    expect(res.error).toContain('ECONNRESET');
    expect(res.data).toBeNull();
  });
});
