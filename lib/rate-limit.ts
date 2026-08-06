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
  // Uploads are per-request, not per-listing, so without an entry here this fell
  // through to the 60/min default — six images a request, ~360 images a minute.
  'POST:/api/upload': { maxRequests: 20, windowMs: 60_000 },
  'POST:/api/contact-numbers': { maxRequests: 10, windowMs: 60_000 },
  'POST:/api/business-accounts': { maxRequests: 5, windowMs: 60_000 },
  'default': { maxRequests: 60, windowMs: 60_000 },
};

const VIEW_LIMIT: RateLimitConfig = { maxRequests: 30, windowMs: 60_000 }; // 30 views/min per IP
// Access-link redemptions. Suppresses scanning noise; with 256-bit tokens,
// guessing was never the threat model.
const ACCESS_LINK_LIMIT: RateLimitConfig = { maxRequests: 10, windowMs: 60_000 };

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
  // Access links carry the token IN THE PATH, so without normalising, every
  // attempt would land in its own bucket and the limit would do nothing.
  if (!config && method === 'GET' && /^\/l\/[A-Za-z0-9_-]{20,}/.test(pathname)) {
    config = ACCESS_LINK_LIMIT;
    routeKey = 'GET:/l/:token';
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
