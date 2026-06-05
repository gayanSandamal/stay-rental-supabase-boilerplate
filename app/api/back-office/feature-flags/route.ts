import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/db/queries';
import {
  featureFlagDefaults,
  getResolvedFeatureFlags,
  type FeatureFlag,
} from '@/lib/feature-flags';
import { loadFeatureFlags, setFeatureFlag } from '@/lib/feature-flags-store';
import { logAudit } from '@/lib/db/audit-logger';

const knownFlags = Object.keys(featureFlagDefaults) as [FeatureFlag, ...FeatureFlag[]];

const updateSchema = z.object({
  flag: z.enum(knownFlags),
  value: z.union([z.boolean(), z.number()]),
});

/**
 * GET /api/back-office/feature-flags
 * Returns the resolved flag values. Admin/ops only.
 */
export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (user.role !== 'admin' && user.role !== 'ops') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await loadFeatureFlags(true);
  return NextResponse.json({ flags: getResolvedFeatureFlags() });
}

/**
 * POST /api/back-office/feature-flags
 * Set a single flag override. Admin only (platform-wide config change).
 */
export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Only admins can change feature flags.' },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { flag, value } = parsed.data;

  // The value type must match the flag's declared type.
  const expectsNumber = typeof featureFlagDefaults[flag] === 'number';
  if (expectsNumber && typeof value !== 'number') {
    return NextResponse.json(
      { error: `Flag "${flag}" expects a number.` },
      { status: 400 }
    );
  }
  if (!expectsNumber && typeof value !== 'boolean') {
    return NextResponse.json(
      { error: `Flag "${flag}" expects a boolean.` },
      { status: 400 }
    );
  }

  const previous = getResolvedFeatureFlags()[flag];
  await setFeatureFlag(flag, value, user.id);

  await logAudit({
    action: 'feature_flag_updated',
    entityType: 'feature_flag',
    userId: user.id,
    metadata: { flag, from: previous, to: value },
  });

  return NextResponse.json({ success: true, flag, value });
}
