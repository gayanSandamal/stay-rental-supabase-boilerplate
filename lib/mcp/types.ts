import type { z } from 'zod';
import type { User } from '@/lib/db/schema';
import type { Scope } from './oauth/config';
import type { CallRoute } from './call-route';

export type Role = User['role'];

export interface ToolContext {
  user: User;
  scopes: Scope[];
  /** Public origin, for building listing links the model can hand back. */
  origin: string;
  callRoute: CallRoute;
}

export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface ToolDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  title: string;
  description: string;
  /** The OAuth scope a token must hold for this tool to be listed or called. */
  scope: Scope;
  /**
   * Roles that see the tool. Omit for everyone. This is a LISTING filter for
   * relevance and a second lock — the route handlers underneath still make the
   * real decision, so an omission here can never widen access.
   */
  roles?: Role[];
  input: S;
  annotations: ToolAnnotations;
  handler: (args: z.infer<S>, ctx: ToolContext) => Promise<unknown>;
}

/** Thrown by a handler to return an `isError` result the model can read and act on. */
export class ToolError extends Error {}

/**
 * Typed at the definition site (the handler sees its parsed arguments), erased
 * afterwards so tools with different inputs live in one array. Arguments are
 * always parsed by `input` before the handler runs (lib/mcp/server.ts), so the
 * erasure never lets an unvalidated value through.
 */
export function defineTool<S extends z.ZodTypeAny>(def: ToolDefinition<S>): ToolDefinition {
  return def as unknown as ToolDefinition;
}
