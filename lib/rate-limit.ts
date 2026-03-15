import { NextResponse } from 'next/server';
import { isFeatureEnabled } from '@/lib/feature-flags';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

const ROUTE_LIMITS: Record<string, RateLimitConfig> = {
  'POST:/api/listings': { maxRequests: 10, windowMs: 60_000 },
  'POST:/api/contact-numbers': { maxRequests: 10, windowMs: 60_000 },
  'POST:/api/business-accounts': { maxRequests: 5, windowMs: 60_000 },
  'default': { maxRequests: 60, windowMs: 60_000 },
};

const VIEW_LIMIT: RateLimitConfig = { maxRequests: 30, windowMs: 60_000 }; // 30 views/min per IP

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real;
  return '127.0.0.1';
}

export function checkRateLimit(
  ip: string,
  method: string,
  pathname: string
): { allowed: boolean; remaining: number; resetAt: number } {
  if (!isFeatureEnabled('enableRateLimiting')) {
    return { allowed: true, remaining: 999, resetAt: 0 };
  }

  cleanup();

  let routeKey = `${method}:${pathname}`;
  let config = ROUTE_LIMITS[routeKey];
  if (!config && method === 'POST' && /\/api\/listings\/\d+\/view$/.test(pathname)) {
    config = VIEW_LIMIT;
    routeKey = 'POST:/api/listings/:id/view'; // Normalize so all view requests share limit
  }
  config = config ?? ROUTE_LIMITS['default'];
  const key = `${ip}:${routeKey}`;
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, remaining: config.maxRequests - 1, resetAt: now + config.windowMs };
  }

  entry.count++;
  const remaining = Math.max(0, config.maxRequests - entry.count);
  if (entry.count > config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { allowed: true, remaining, resetAt: entry.resetAt };
}

export function rateLimitResponse(resetAt: number): NextResponse {
  const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Remaining': '0',
      },
    }
  );
}
