import type { ToolDefinition } from '../types';
import { renterTools } from './renter';
import { landlordTools } from './landlord';
import { adminTools } from './admin';

/** Every tool the Easy Rent MCP server offers, before role/scope filtering. */
export const ALL_TOOLS: ToolDefinition[] = [
  ...renterTools,
  ...landlordTools,
  ...adminTools,
];
