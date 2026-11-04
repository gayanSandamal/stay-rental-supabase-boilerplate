import type { NextRequest } from 'next/server';
import { json, preflight } from '@/lib/mcp/http';
import { originFromHeaders } from '@/lib/mcp/oauth/config';
import { protectedResourceMetadata } from '@/lib/mcp/oauth/metadata';

/**
 * Served at /.well-known/oauth-protected-resource and
 * /.well-known/oauth-protected-resource/mcp (next.config.ts rewrites) — RFC
 * 9728 §3.1 puts the resource's path after the well-known segment, and some
 * clients only try the bare form, so both answer.
 */
export async function GET(request: NextRequest) {
  return json(protectedResourceMetadata(originFromHeaders(request.headers)), {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}

export const OPTIONS = preflight;
