import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ParsedIntake, computeMissingFields } from '@/lib/intake/parser/types';

// The rule parser and the flag store are concurrent-moving parts; the merge
// and fail-soft contracts under test must not depend on either.
vi.mock('@/lib/feature-flags', () => ({
  isFeatureEnabled: vi.fn(() => true),
}));
vi.mock('@/lib/intake/parser/rule-parser', () => ({
  RULES_VERSION: 1,
  parseIntakeRules: vi.fn(),
}));

import { parseIntake } from '@/lib/intake/parser';
import { parseIntakeWithLlm } from '@/lib/intake/parser/llm-parser';
import { parseIntakeRules } from '@/lib/intake/parser/rule-parser';

const EMPTY: ParsedIntake = {
  title: null,
  propertyType: null,
  address: null,
  city: null,
  district: null,
  bedrooms: null,
  bathrooms: null,
  rentPerMonth: null,
  description: null,
  missingFields: [],
  suspicious: false,
  suspicionReason: null,
  parserMeta: { engine: 'rules', rulesVersion: 1 },
};

function ruleResult(overrides: Partial<ParsedIntake>): ParsedIntake {
  const r = { ...EMPTY, ...overrides };
  r.missingFields = computeMissingFields(r);
  return r;
}

const sfReply = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

const anthropicReply = (text: string) =>
  new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status: 200 });

describe('parser LLM fallback', () => {
  const originalFetch = global.fetch;
  const savedEnv: Record<string, string | undefined> = {};
  const ENV_KEYS = ['SILICONFLOW_API_KEY', 'MODERATION_API_KEY', 'ANTHROPIC_API_KEY', 'INTAKE_LLM_MODEL'];

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
    process.env.SILICONFLOW_API_KEY = 'test-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    vi.clearAllMocks();
  });

  it('fills only the fields the rules left null and never overrides rule values', async () => {
    vi.mocked(parseIntakeRules).mockReturnValue(
      ruleResult({ title: '2BR House in Nugegoda', address: '12 Temple Lane', bedrooms: 2, rentPerMonth: 85000 })
    );
    global.fetch = vi.fn(async () =>
      sfReply('{"city":"Kolonnawa","bedrooms":5,"rentPerMonth":999,"title":"LLM title"}')
    ) as any;

    const merged = await parseIntake('house in kolonnawa');

    expect(merged.city).toBe('Kolonnawa'); // rules had null
    expect(merged.bedrooms).toBe(2); // rules win
    expect(merged.rentPerMonth).toBe(85000); // rules win
    expect(merged.title).toBe('2BR House in Nugegoda'); // rules win
    expect(merged.missingFields).toEqual([]);
    expect(merged.parserMeta?.engine).toBe('rules+llm');
  });

  it('keeps the multiProperty flag through the merge — the split guard must survive', async () => {
    vi.mocked(parseIntakeRules).mockReturnValue(ruleResult({ multiProperty: true, bedrooms: 2 }));
    global.fetch = vi.fn(async () =>
      sfReply('{"title":"2BR House in Kandy","city":"Kandy","address":"1 Lane","rentPerMonth":50000}')
    ) as any;

    const merged = await parseIntake('I have two houses for rent…');
    expect(merged.multiProperty).toBe(true);
  });

  it('retrofits an LLM-recovered city into a cityless rule title', async () => {
    // The rules now compose "3BR House" when the gazetteer misses the town;
    // publishing that title without the town was the regression.
    vi.mocked(parseIntakeRules).mockReturnValue(
      ruleResult({
        title: '3BR House',
        propertyType: 'house',
        bedrooms: 3,
        address: '45/2 Temple Rd',
        rentPerMonth: 85000,
      })
    );
    global.fetch = vi.fn(async () => sfReply('{"city":"Nugegoda"}')) as any;

    const merged = await parseIntake('3 bed house, 45/2 Temple Rd, Nugegodaa, 85k');
    expect(merged.title).toBe('3BR House in Nugegoda');
    expect(merged.missingFields).toEqual([]);
  });

  it('treats empty-string model fields as unknown, never as present', async () => {
    // Constrained JSON decoding often emits "" for unknowns; '' must not
    // satisfy computeMissingFields and publish a blank-titled listing.
    vi.mocked(parseIntakeRules).mockReturnValue(
      ruleResult({ bedrooms: 3, rentPerMonth: 50000, address: '1 Lane' })
    );
    global.fetch = vi.fn(async () => sfReply('{"title":"","city":"  ","district":""}')) as any;

    const merged = await parseIntake('some message');
    expect(merged.title).toBeNull();
    expect(merged.city).toBeNull();
    expect(merged.missingFields).toContain('title');
    expect(merged.missingFields).toContain('city');
  });

  it('marks parserMeta.llmFailed when the fallback attempt came back empty', async () => {
    vi.mocked(parseIntakeRules).mockReturnValue(ruleResult({ bedrooms: 3 }));
    global.fetch = vi.fn(async () => new Response('boom', { status: 500 })) as any;
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const out = await parseIntake('some message');
    expect(out.parserMeta?.llmFailed).toBe(true);
    expect(out.parserMeta?.engine).toBe('rules');
  });

  it('asks SiliconFlow for exactly the missing fields, temperature 0, JSON mode', async () => {
    const calls: Array<{ url: string; body: any; headers: any }> = [];
    global.fetch = vi.fn(async (url: any, init: any) => {
      calls.push({ url: String(url), body: JSON.parse(init.body), headers: init.headers });
      return sfReply('{"city":"Kolonnawa"}');
    }) as any;

    const parsed = await parseIntakeWithLlm('house in kolonnawa', ['city', 'rentPerMonth']);

    expect(parsed?.city).toBe('Kolonnawa');
    const [call] = calls;
    expect(call.url).toContain('/chat/completions');
    expect(call.url).not.toContain('anthropic');
    expect(call.headers.authorization).toBe('Bearer test-key');
    expect(call.body.model).toBe('Qwen/Qwen3-8B');
    expect(call.body.temperature).toBe(0);
    expect(call.body.response_format).toEqual({ type: 'json_object' });
    expect(call.body.enable_thinking).toBe(false);
    const system: string = call.body.messages[0].content;
    expect(system).toContain('- city:');
    expect(system).toContain('- rentPerMonth:');
    expect(system).not.toContain('- bedrooms:');
  });

  it('honours the INTAKE_LLM_MODEL override', async () => {
    process.env.INTAKE_LLM_MODEL = 'Qwen/Qwen2.5-7B-Instruct';
    let model = '';
    global.fetch = vi.fn(async (_url: any, init: any) => {
      model = JSON.parse(init.body).model;
      return sfReply('{"city":"Galle"}');
    }) as any;

    await parseIntakeWithLlm('house in galle', ['city']);
    expect(model).toBe('Qwen/Qwen2.5-7B-Instruct');
  });

  it('fails soft on a non-200 response — the rules result stands', async () => {
    const rule = ruleResult({ bedrooms: 3 });
    vi.mocked(parseIntakeRules).mockReturnValue(rule);
    global.fetch = vi.fn(async () => new Response('rate limited', { status: 429 })) as any;
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(parseIntake('some message')).resolves.toEqual(rule);
  });

  it('fails soft on garbage JSON in the reply', async () => {
    const rule = ruleResult({ bedrooms: 3 });
    vi.mocked(parseIntakeRules).mockReturnValue(rule);
    global.fetch = vi.fn(async () => sfReply('{ not json at all')) as any;

    await expect(parseIntake('some message')).resolves.toEqual(rule);
  });

  it('fails soft when fetch itself throws (network/timeout)', async () => {
    const rule = ruleResult({ bedrooms: 3 });
    vi.mocked(parseIntakeRules).mockReturnValue(rule);
    global.fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as any;
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(parseIntake('some message')).resolves.toEqual(rule);
  });

  it('skips the LLM entirely when no provider key is configured', async () => {
    delete process.env.SILICONFLOW_API_KEY;
    const rule = ruleResult({ bedrooms: 3 });
    vi.mocked(parseIntakeRules).mockReturnValue(rule);
    global.fetch = vi.fn() as any;

    await expect(parseIntake('some message')).resolves.toEqual(rule);
    await expect(parseIntakeWithLlm('some message', ['city'])).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('skips the LLM when the rules flagged the message as suspicious', async () => {
    const rule = ruleResult({ suspicious: true, suspicionReason: 'scam pattern' });
    vi.mocked(parseIntakeRules).mockReturnValue(rule);
    global.fetch = vi.fn() as any;

    await expect(parseIntake('send me an advance')).resolves.toEqual(rule);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('falls back to the Anthropic path when only ANTHROPIC_API_KEY is set', async () => {
    delete process.env.SILICONFLOW_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const calls: Array<{ url: string; headers: any }> = [];
    global.fetch = vi.fn(async (url: any, init: any) => {
      calls.push({ url: String(url), headers: init.headers });
      return anthropicReply('{"city":"Kolonnawa"}');
    }) as any;

    const parsed = await parseIntakeWithLlm('house in kolonnawa', ['city']);

    expect(parsed?.city).toBe('Kolonnawa');
    expect(calls[0].url).toContain('api.anthropic.com');
    expect(calls[0].headers['x-api-key']).toBe('sk-ant-test');
  });

  it('prefers SiliconFlow when both keys are set', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    let url = '';
    global.fetch = vi.fn(async (u: any) => {
      url = String(u);
      return sfReply('{"city":"Kandy"}');
    }) as any;

    await parseIntakeWithLlm('house in kandy', ['city']);
    expect(url).toContain('/chat/completions');
    expect(url).not.toContain('anthropic');
  });
});
