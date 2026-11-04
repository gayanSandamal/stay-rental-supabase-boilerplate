import type { NextRequest } from 'next/server';
import { json, preflight } from '@/lib/mcp/http';
import { originFromHeaders } from '@/lib/mcp/oauth/config';
import { authorizationServerMetadata } from '@/lib/mcp/oauth/metadata';

/**
 * Served at /.well-known/oauth-authorization-server (next.config.ts rewrite).
 * Static apart from the origin, and safe to cache briefly at the edge.
 */
export async function GET(request: NextRequest) {
  return json(authorizationServerMetadata(originFromHeaders(request.headers)), {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}

export const OPTIONS = preflight;
