import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// Route modules pulled in by the tool registry construct a (lazy) postgres
// client at import time; no query is ever made in this file.
vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgres://test:test@127.0.0.1:1/test';
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:1';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test';
});
vi.mock('server-only', () => ({}));

import {
  LATEST_PROTOCOL_VERSION,
  RPC,
  dispatch,
  visibleTools,
} from '@/lib/mcp/server';
import { zodToJsonSchema } from '@/lib/mcp/json-schema';
import { ToolError, defineTool, type ToolContext } from '@/lib/mcp/types';
import type { User } from '@/lib/db/schema';

const user = (role: User['role']) => ({ id: 7, role }) as User;
const ctx = (role: User['role'], scopes: ToolContext['scopes']): ToolContext => ({
  user: user(role),
  scopes,
  origin: 'https://easyrent.lk',
  callRoute: async () => {
    throw new Error('not used');
  },
});

const echo = defineTool({
  name: 'echo',
  title: 'Echo',
  description: 'Echo a word',
  scope: 'read',
  input: z.object({ word: z.string().min(1) }),
  annotations: { readOnlyHint: true },
  handler: async ({ word }) => ({ word }),
});
const refuse = defineTool({
  name: 'refuse',
  title: 'Refuse',
  description: 'Always refuses',
  scope: 'write',
  input: z.object({}),
  annotations: { readOnlyHint: false },
  handler: async () => {
    throw new ToolError('Not allowed for you');
  },
});
const crash = defineTool({
  name: 'crash',
  title: 'Crash',
  description: 'Throws unexpectedly',
  scope: 'read',
  input: z.object({}),
  annotations: { readOnlyHint: true },
  handler: async () => {
    throw new Error('db exploded: password=hunter2');
  },
});
const staffOnly = defineTool({
  name: 'staff_only',
  title: 'Staff only',
  description: 'Back office',
  scope: 'admin',
  roles: ['ops', 'admin'],
  input: z.object({}),
  annotations: { readOnlyHint: true },
  handler: async () => 'ok',
});
const TOOLS = [echo, refuse, crash, staffOnly];

const call = (method: string, params?: Record<string, unknown>) =>
  ({ jsonrpc: '2.0', method, id: 1, ...(params ? { params } : {}) });

describe('MCP protocol dispatch', () => {
  it('initialize echoes a supported protocol version and declares only tools', async () => {
    const r: any = await dispatch(call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } }), {
      tools: TOOLS,
      ctx: ctx('tenant', ['read']),
    });
    expect(r.result.protocolVersion).toBe('2025-06-18');
    expect(r.result.capabilities).toEqual({ tools: { listChanged: false } });
    expect(r.result.serverInfo.name).toBe('easyrent');
    expect(r.result.instructions).toMatch(/LKR/);
  });

  it('initialize answers an unknown version with the latest it supports', async () => {
    const r: any = await dispatch(call('initialize', { protocolVersion: '1999-01-01' }), { tools: TOOLS, ctx: ctx('tenant', ['read']) });
    expect(r.result.protocolVersion).toBe(LATEST_PROTOCOL_VERSION);
  });

  it('gives notifications no response', async () => {
    const notification = { jsonrpc: '2.0', method: 'notifications/initialized' };
    expect(await dispatch(notification, { tools: TOOLS, ctx: ctx('tenant', ['read']) })).toBeNull();
  });

  it('answers ping and refuses unknown methods', async () => {
    const env = { tools: TOOLS, ctx: ctx('tenant', ['read']) };
    expect(((await dispatch(call('ping'), env)) as any).result).toEqual({});
    expect(((await dispatch(call('resources/list'), env)) as any).error.code).toBe(RPC.METHOD_NOT_FOUND);
  });

  it('rejects malformed messages', async () => {
    const r: any = await dispatch({ hello: 'world' }, { tools: TOOLS, ctx: ctx('tenant', ['read']) });
    expect(r.error.code).toBe(RPC.INVALID_REQUEST);
  });

  it('lists only tools the token scope AND the user role allow', async () => {
    const names = (role: User['role'], scopes: ToolContext['scopes']) =>
      visibleTools(TOOLS, ctx(role, scopes)).map((t) => t.name);
    expect(names('tenant', ['read'])).toEqual(['echo', 'crash']);
    expect(names('tenant', ['read', 'write'])).toEqual(['echo', 'refuse', 'crash']);
    // admin scope on a non-staff account shows nothing extra — the role still gates.
    expect(names('landlord', ['read', 'write', 'admin'])).toEqual(['echo', 'refuse', 'crash']);
    // staff without the admin scope do not get back-office tools either.
    expect(names('ops', ['read', 'write'])).toEqual(['echo', 'refuse', 'crash']);
    expect(names('ops', ['read', 'admin'])).toContain('staff_only');
  });

  it('calling a tool outside scope reads exactly like an unknown tool', async () => {
    const env = { tools: TOOLS, ctx: ctx('tenant', ['read']) };
    const hidden: any = await dispatch(call('tools/call', { name: 'staff_only', arguments: {} }), env);
    const missing: any = await dispatch(call('tools/call', { name: 'nope', arguments: {} }), env);
    expect(hidden.error.code).toBe(RPC.INVALID_PARAMS);
    expect(hidden.error.message.replace('staff_only', 'X')).toBe(missing.error.message.replace('nope', 'X'));
  });

  it('returns results as JSON text content', async () => {
    const r: any = await dispatch(call('tools/call', { name: 'echo', arguments: { word: 'hi' } }), { tools: TOOLS, ctx: ctx('tenant', ['read']) });
    expect(r.result.isError).toBeUndefined();
    expect(JSON.parse(r.result.content[0].text)).toEqual({ word: 'hi' });
  });

  it('reports bad arguments as an isError result the model can fix', async () => {
    const r: any = await dispatch(call('tools/call', { name: 'echo', arguments: { word: '' } }), { tools: TOOLS, ctx: ctx('tenant', ['read']) });
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toMatch(/word/);
  });

  it('passes a ToolError message through, and hides an unexpected error', async () => {
    const env = { tools: TOOLS, ctx: ctx('tenant', ['read', 'write']) };
    const refused: any = await dispatch(call('tools/call', { name: 'refuse', arguments: {} }), env);
    expect(refused.result).toEqual({ content: [{ type: 'text', text: 'Not allowed for you' }], isError: true });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const crashed: any = await dispatch(call('tools/call', { name: 'crash', arguments: {} }), env);
    spy.mockRestore();
    expect(crashed.result.isError).toBe(true);
    expect(crashed.result.content[0].text).not.toMatch(/hunter2|exploded/);
  });
});

describe('zodToJsonSchema', () => {
  it('renders the shapes tools use', () => {
    const schema = zodToJsonSchema(
      z.object({
        q: z.string().min(2).max(10).describe('query'),
        n: z.number().int().min(1).max(5).default(3),
        kind: z.enum(['a', 'b']).optional(),
        ids: z.array(z.number().int()).min(1).max(4),
        yes: z.literal(true),
      })
    );
    expect(schema).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['q', 'ids', 'yes'],
      properties: {
        q: { type: 'string', minLength: 2, maxLength: 10, description: 'query' },
        n: { type: 'integer', minimum: 1, maximum: 5, default: 3 },
        kind: { type: 'string', enum: ['a', 'b'] },
        ids: { type: 'array', items: { type: 'integer' }, minItems: 1, maxItems: 4 },
        yes: { const: true },
      },
    });
  });

  it('throws on a type it does not understand rather than advertising nothing', () => {
    expect(() => zodToJsonSchema(z.object({ d: z.date() }))).toThrow(/unsupported/);
  });
});

describe('the real tool registry', () => {
  it('every tool has a valid name, a schema that renders, and honest annotations', async () => {
    const { ALL_TOOLS } = await import('@/lib/mcp/tools');
    const names = new Set<string>();
    expect(ALL_TOOLS.length).toBeGreaterThanOrEqual(20);
    for (const tool of ALL_TOOLS) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]{2,63}$/);
      expect(names.has(tool.name)).toBe(false);
      names.add(tool.name);
      expect(tool.description.length).toBeGreaterThan(20);
      const schema = zodToJsonSchema(tool.input);
      expect(schema.type).toBe('object');
      // A tool that needs `read` must not write; a writing tool must say so.
      if (tool.scope === 'read') expect(tool.annotations.readOnlyHint).toBe(true);
      if (tool.scope === 'write') expect(tool.annotations.readOnlyHint).toBe(false);
      // Back-office tools are always role-gated, never scope-gated alone.
      if (tool.scope === 'admin') {
        expect(tool.roles?.length).toBeGreaterThan(0);
        expect(tool.roles!.every((r) => r === 'ops' || r === 'admin')).toBe(true);
      }
    }
  }, 30_000);

  it('a renter with read+write sees no back-office tools', async () => {
    const { ALL_TOOLS } = await import('@/lib/mcp/tools');
    const visible = visibleTools(ALL_TOOLS, ctx('tenant', ['read', 'write', 'admin'])).map((t) => t.name);
    expect(visible.some((n) => n.startsWith('admin_'))).toBe(false);
    expect(visible).toContain('search_listings');
    expect(visible).toContain('create_listing');
  }, 30_000);

  it('visibility activation demands an explicit payment confirmation', async () => {
    const { ALL_TOOLS } = await import('@/lib/mcp/tools');
    const tool = ALL_TOOLS.find((t) => t.name === 'admin_activate_visibility')!;
    expect(tool.input.safeParse({ listingId: 1, product: 'boost' }).success).toBe(false);
    expect(tool.input.safeParse({ listingId: 1, product: 'boost', paymentConfirmed: false }).success).toBe(false);
    expect(tool.input.safeParse({ listingId: 1, product: 'boost', paymentConfirmed: true }).success).toBe(true);
  }, 30_000);
});

/** Source scans read code, not comments — the comments explain the very bugs being guarded. */
function codeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? codeFiles(p) : p.endsWith('.ts') || p.endsWith('.tsx') ? [p] : [];
  });
}
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('MCP source guards', () => {
  const files = [
    ...codeFiles(join(process.cwd(), 'lib/mcp')),
    join(process.cwd(), 'app/mcp/route.ts'),
    ...codeFiles(join(process.cwd(), 'app/api/oauth')),
  ];

  it('never runs queries concurrently (max: 1 pool, commit a3ac4f9)', () => {
    for (const f of files) expect(stripComments(readFileSync(f, 'utf-8')), f).not.toMatch(/Promise\.all/);
  });

  it('never stores a raw token — every insert goes through sha256Hex', () => {
    const store = stripComments(readFileSync(join(process.cwd(), 'lib/mcp/oauth/store.ts'), 'utf-8'));
    expect(store).not.toMatch(/accessTokenHash:\s*(accessToken|token)\b/);
    expect(store).not.toMatch(/codeHash:\s*code\b/);
  });

  it('getUser consults the MCP principal before cookies', () => {
    const q = readFileSync(join(process.cwd(), 'lib/db/queries.ts'), 'utf-8');
    const body = q.slice(q.indexOf('export const getUser = cache('));
    expect(body.indexOf('getMcpPrincipal()')).toBeGreaterThan(-1);
    expect(body.indexOf('getMcpPrincipal()')).toBeLessThan(body.indexOf('createClient()'));
  });
});
