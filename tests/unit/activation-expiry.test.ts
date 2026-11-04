import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { activationExpiresAt } from '@/lib/listings/activation-expiry';

/**
 * Re-approving an EXPIRED listing must give it a future expiry.
 *
 * It used to keep the past `expiresAt`, so the expire-listings cron (every 15
 * minutes, `status = 'active' AND expires_at < now()`) flipped it back to
 * `expired` right after the landlord had been told it was approved.
 */
const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-11-04T10:00:00Z');

describe('activationExpiresAt', () => {
  it('moves a past expiry to now + listingExpirationDays', () => {
    const past = new Date(now.getTime() - 5 * DAY);
    const result = activationExpiresAt(past, now, 30);
    expect(result.getTime()).toBeGreaterThan(now.getTime());
    expect(result.getTime()).toBe(now.getTime() + 30 * DAY);
  });

  it('treats an expiry of exactly now as expired', () => {
    expect(activationExpiresAt(new Date(now), now, 30).getTime()).toBe(now.getTime() + 30 * DAY);
  });

  it('starts a fresh window when there is no expiry', () => {
    expect(activationExpiresAt(null, now, 14).getTime()).toBe(now.getTime() + 14 * DAY);
    expect(activationExpiresAt(undefined, now, 14).getTime()).toBe(now.getTime() + 14 * DAY);
  });

  it('keeps an expiry that is still in the future (no free extra days)', () => {
    const future = new Date(now.getTime() + 3 * DAY);
    expect(activationExpiresAt(future, now, 30)).toBe(future);
  });

  it('never returns a past date for a nonsense flag value', () => {
    const past = new Date(now.getTime() - DAY);
    for (const days of [0, -5, Number.NaN]) {
      expect(activationExpiresAt(past, now, days).getTime()).toBe(now.getTime() + 30 * DAY);
    }
  });
});

function code(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Every path that sets a listing `active` must take its expiry from the helper.
 * The bug was three copies of `expiresAt ?? now + days`, which keeps a past
 * date; a fourth copy would bring it back for that path.
 */
describe('every activation path uses activationExpiresAt', () => {
  const paths = [
    'app/api/listings/[id]/route.ts',
    'app/(dashboard)/back-office/moderation/actions.ts',
    'lib/moderation/engine.ts',
  ];

  for (const path of paths) {
    it(path, () => {
      const src = code(path);
      expect(src).toMatch(/activationExpiresAt\(/);
      // The old rule: keep the existing expiry whenever there is one.
      expect(src).not.toMatch(/expiresAt\s*\?\?\s*new Date\(/);
    });
  }

  it('the PATCH route no longer only fills a missing expiry', () => {
    const src = code('app/api/listings/[id]/route.ts');
    expect(src).not.toMatch(/!listing\.expiresAt\s*&&\s*listing\.publishedAt/);
  });
});
