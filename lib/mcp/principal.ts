import { AsyncLocalStorage } from 'node:async_hooks';
import type { User } from '@/lib/db/schema';

/**
 * WHO A REQUEST ACTS AS WHEN IT ARRIVED THROUGH THE MCP CONNECTOR.
 *
 * MCP tools call the app's own route handlers (lib/mcp/call-route.ts), so every
 * role check, ownership check, moderation rule and audit entry lives in ONE
 * place rather than being re-implemented here and left to drift. Those handlers
 * all ask `getUser()` who is calling — and an MCP request carries a bearer
 * token, not a Supabase cookie. This store is the bridge: the MCP endpoint
 * resolves the token, then runs the tool inside `runAsMcpUser`, and getUser()
 * returns that user for everything underneath.
 *
 * Shaped exactly like getUser()'s own non-impersonating result, so no caller
 * can tell the difference — which is the point. `impersonatedBy` is always
 * null: an MCP grant can never be created while impersonating (the consent
 * handler refuses), so a token can never act as anyone but the person who
 * approved it.
 *
 * Scoped by AsyncLocalStorage, never a module variable: Fluid Compute serves
 * concurrent requests from one instance, and a shared variable would hand one
 * user's identity to another user's request.
 */
export type McpPrincipal = User & {
  emailVerified: boolean;
  impersonatedBy: null;
  impersonationExpiresAt: null;
};

const store = new AsyncLocalStorage<McpPrincipal>();

export function runAsMcpUser<T>(user: User, fn: () => Promise<T>): Promise<T> {
  const principal: McpPrincipal = {
    ...user,
    // The person approved this connection from a live Supabase session; the
    // only reader of this field is the unverified-email banner.
    emailVerified: true,
    impersonatedBy: null,
    impersonationExpiresAt: null,
  };
  return store.run(principal, fn);
}

export function getMcpPrincipal(): McpPrincipal | undefined {
  return store.getStore();
}
