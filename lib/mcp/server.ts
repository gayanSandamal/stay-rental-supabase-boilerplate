import { z } from 'zod';
import { zodToJsonSchema } from './json-schema';
import { ToolError, type ToolContext, type ToolDefinition } from './types';

/**
 * The MCP protocol layer: JSON-RPC 2.0 over Streamable HTTP, stateless.
 *
 * STATELESS ON PURPOSE. Every request carries its own bearer token and every
 * tool call is independent, so there is nothing a session would hold — and a
 * session would be wrong on Vercel, where consecutive requests land on
 * different instances. No Mcp-Session-Id is issued, GET (the server-push SSE
 * stream) answers 405, and every POST gets a plain application/json reply,
 * which the spec allows a server to choose for any request.
 *
 * Kept free of Next and of auth so tests/unit/mcp-server.test.ts can drive it
 * directly with fake tools.
 */

export const SERVER_INFO = { name: 'easyrent', title: 'Easy Rent', version: '1.0.0' } as const;

/** Newest first. initialize echoes the client's version when we support it. */
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'] as const;
export const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];
/** What a request without an MCP-Protocol-Version header is assumed to speak. */
export const DEFAULT_NEGOTIATED_VERSION = '2025-03-26';

export const SERVER_INSTRUCTIONS = `Easy Rent (easyrent.lk) is a verified marketplace for MID-TO-LONG-TERM house and apartment rentals in Sri Lanka (1-12+ month leases), not holiday stays.
- Prices are in Sri Lankan rupees (LKR) per month. Deposits are counted in MONTHS of rent; notice periods in days.
- Sri Lankan renters care about power backup (generator/solar/UPS), water source (mains/tank/borehole), and fibre internet — search_listings filters on all of them.
- Renters contact landlords directly by phone or WhatsApp; there is no booking or in-app messaging. get_listing returns the landlord's published numbers and a link to the listing page.
- Only ever describe listings these tools returned. Always give the listing URL so the user can check photos and details themselves.
- Listing on Easy Rent is free. New and edited listings are reviewed before they are public, so a listing you create will show status "pending" first.
- Tools act as the signed-in user with that user's own permissions. If a tool says something is not allowed, explain that to the user rather than retrying.`;

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export const RPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

export function rpcError(id: JsonRpcResponse['id'], code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

export interface DispatchEnv {
  tools: ToolDefinition[];
  ctx: ToolContext;
}

/** The tools this user, with these scopes, can see and call. */
export function visibleTools(tools: ToolDefinition[], ctx: Pick<ToolContext, 'user' | 'scopes'>): ToolDefinition[] {
  return tools.filter(
    (t) => ctx.scopes.includes(t.scope) && (!t.roles || t.roles.includes(ctx.user.role))
  );
}

export function describeTool(tool: ToolDefinition) {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: zodToJsonSchema(tool.input),
    annotations: { title: tool.title, ...tool.annotations },
  };
}

function isRequest(msg: unknown): msg is JsonRpcRequest {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as JsonRpcRequest).jsonrpc === '2.0' &&
    typeof (msg as JsonRpcRequest).method === 'string'
  );
}

/**
 * Handle one JSON-RPC message. Returns null for a notification (no id), which
 * gets no response body.
 */
export async function dispatch(msg: unknown, env: DispatchEnv): Promise<JsonRpcResponse | null> {
  if (!isRequest(msg)) {
    const id = (msg as { id?: JsonRpcResponse['id'] } | null)?.id ?? null;
    // A response or anything malformed. Clients never send us responses —
    // we make no server→client requests — so there is nothing to correlate.
    if (msg && typeof msg === 'object' && ('result' in msg || 'error' in msg)) return null;
    return rpcError(id, RPC.INVALID_REQUEST, 'Invalid JSON-RPC request');
  }

  const isNotification = msg.id === undefined;
  if (isNotification) return null; // notifications/initialized, cancelled, etc.
  const id = msg.id ?? null;

  try {
    switch (msg.method) {
      case 'initialize': {
        const requested = typeof msg.params?.protocolVersion === 'string' ? msg.params.protocolVersion : null;
        const protocolVersion =
          requested && (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
            ? requested
            : LATEST_PROTOCOL_VERSION;
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion,
            capabilities: { tools: { listChanged: false } },
            serverInfo: SERVER_INFO,
            instructions: SERVER_INSTRUCTIONS,
          },
        };
      }

      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id,
          result: { tools: visibleTools(env.tools, env.ctx).map(describeTool) },
        };

      case 'tools/call': {
        const name = msg.params?.name;
        if (typeof name !== 'string') return rpcError(id, RPC.INVALID_PARAMS, 'params.name is required');
        const tool = visibleTools(env.tools, env.ctx).find((t) => t.name === name);
        if (!tool) {
          // Same answer whether the tool does not exist or this user may not
          // use it: the error must not enumerate what other roles can do.
          return rpcError(id, RPC.INVALID_PARAMS, `Unknown tool: ${name}`);
        }
        return { jsonrpc: '2.0', id, result: await callTool(tool, msg.params?.arguments, env.ctx) };
      }

      default:
        return rpcError(id, RPC.METHOD_NOT_FOUND, `Method not found: ${msg.method}`);
    }
  } catch (err) {
    console.error('[mcp] dispatch failed', msg.method, err);
    return rpcError(id, RPC.INTERNAL_ERROR, 'Internal error');
  }
}

/**
 * Run a tool. Bad arguments and refused actions come back as `isError` RESULTS,
 * not protocol errors — the spec's guidance, because a result reaches the
 * model, which can then correct the call or explain the refusal to the user.
 */
export async function callTool(tool: ToolDefinition, rawArgs: unknown, ctx: ToolContext) {
  const parsed = tool.input.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return errorResult(`Invalid arguments for ${tool.name}: ${formatZodError(parsed.error)}`);
  }
  try {
    const data = await tool.handler(parsed.data, ctx);
    const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    return { content: [{ type: 'text', text }] };
  } catch (err) {
    if (err instanceof ToolError) return errorResult(err.message);
    console.error(`[mcp] tool ${tool.name} failed`, err);
    return errorResult('Something went wrong on Easy Rent while running this tool. Please try again shortly.');
  }
}

function errorResult(text: string) {
  return { content: [{ type: 'text', text }], isError: true };
}

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.length ? i.path.join('.') : '(arguments)'}: ${i.message}`)
    .join('; ');
}
