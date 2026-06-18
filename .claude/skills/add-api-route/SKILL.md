---
name: add-api-route
description: >
  Scaffold a Next.js App Router API route in Easy Rent (app/api/**) with the
  project's standard auth, RBAC, Zod validation, rate limiting, and audit
  logging. Use when adding or modifying an endpoint / route handler. Produces a
  route that matches existing handlers exactly.
---

# Add an API route

Mirror an existing route before writing (`app/api/listings/[id]/feature/route.ts`, `app/api/listings/route.ts`). Routes live at `app/api/<path>/route.ts` and export `GET`/`POST`/`PATCH`/`DELETE`.

## Template

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { listings } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { logAudit } from '@/lib/db/audit-logger';
import { checkRateLimit, rateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const bodySchema = z.object({ /* fields */ });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  // 1) Authentication
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 2) Authorization (omit/relax for landlord-owned or public actions)
  if (user.role !== 'admin' && user.role !== 'ops') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 3) Rate limit (mutations). Add a ROUTE_LIMITS entry in lib/rate-limit.ts if hot.
  const ip = getClientIp(request);
  const rl = checkRateLimit(ip, 'POST', '/api/<path>');
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  // 4) Resolve + validate dynamic params
  const resolvedParams = params instanceof Promise ? await params : params;
  const id = Number(resolvedParams.id);
  if (isNaN(id) || id <= 0) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  // 5) Validate body
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  // 6) Work (Drizzle). For landlord actions, verify ownership via landlordId.

  // 7) Audit consequential mutations
  await logAudit({ action: 'listing_updated', entityType: 'listing', entityId: id, userId: user.id, ipAddress: ip });

  return NextResponse.json({ success: true });
}
```

## Rules
- **Auth** is always `getUser()` — never trust client-provided user IDs. It returns the `public.users` row bridged from Supabase Auth, excluding soft-deleted users.
- **RBAC**: `admin`/`ops` for back-office, exports, and all visibility activation; `landlord` for own-listing mutations (check ownership); public reads need no auth.
- **Dynamic `params` are Promises** in this Next.js version — await them.
- **Validation** via Zod, returning the first message at 400. For Server Actions use `validatedAction`/`validatedActionWithUser` (`lib/auth/middleware.ts`) instead of a route.
- **Rate limit** writes; the limiter is in-memory/per-instance (abuse-dampening only).
- **Audit** consequential mutations; a new `action` needs an `audit_action` enum value + migration (use `add-db-migration`).
- **Cron** routes must verify the `CRON_SECRET` bearer token first.
- Error bodies are `{ error: string }`; keep auth errors generic (no account enumeration).

## Monetization caveat
Any visibility/payment-related route (Boost/Featured/Urgent/bundle/plan) must stay **admin/ops-only manual activation** — see the `change-monetization` skill and the monetization-guardian agent.
