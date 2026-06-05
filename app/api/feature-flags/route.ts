import { NextResponse } from 'next/server';
import { getPublicFeatureFlags } from '@/lib/feature-flags';
import { loadFeatureFlags } from '@/lib/feature-flags-store';

/**
 * GET /api/feature-flags
 * Public, read-only. Returns only the flags marked `public` in
 * lib/feature-flags.ts so client components can gate UI (e.g. pricing/upgrade
 * CTAs) without bundling server-only flag state.
 */
export async function GET() {
  await loadFeatureFlags();
  return NextResponse.json({ flags: getPublicFeatureFlags() });
}
