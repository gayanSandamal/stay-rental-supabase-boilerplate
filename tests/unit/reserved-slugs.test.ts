import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RESERVED_SLUGS, isReservedSlug } from '@/lib/reserved-slugs';

/**
 * Landlord profiles live at the root (`app/(dashboard)/[slug]/page.tsx`), so
 * every real top-level route competes with the catch-all. A landlord who claims
 * one gets a profile URL that silently resolves to another page — permanently,
 * because the slug can only be set once.
 *
 * This walks the app directory so a new top-level route fails the suite unless
 * it is also reserved. The list used to exist twice and the copies had already
 * drifted apart; this is what stops that recurring.
 */

const APP = join(process.cwd(), 'app');

/** Real URL segments a request could resolve to, from the filesystem router. */
function topLevelRouteSegments(): string[] {
  const segments = new Set<string>();

  const collect = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      // Route groups like (dashboard) are not URL segments — descend into them.
      if (name.startsWith('(') && name.endsWith(')')) {
        collect(join(dir, name));
        continue;
      }
      // Dynamic segments and private folders own no fixed path.
      if (name.startsWith('[') || name.startsWith('_') || name.startsWith('@')) continue;
      segments.add(name);
    }
  };

  collect(APP);
  return [...segments].sort();
}

describe('reserved slugs', () => {
  it('reserves every real top-level route segment', () => {
    const unreserved = topLevelRouteSegments().filter((s) => !RESERVED_SLUGS.has(s));
    expect(
      unreserved,
      `These top-level routes are claimable as landlord profile slugs. Add them to lib/reserved-slugs.ts:\n  ${unreserved.join('\n  ')}`
    ).toEqual([]);
  });

  it('reserves the routes whose absence caused the original bug', () => {
    // `how-to-use` was missing from the WRITE path, so it was claimable.
    // `api`/`me` were missing from the RENDER path.
    // `l` is the WhatsApp access-link route — the only way an intake landlord
    // gets back into their account.
    for (const slug of ['how-to-use', 'api', 'me', 'l', 'auth', 'link-expired']) {
      expect(isReservedSlug(slug), slug).toBe(true);
    }
  });

  it('reserves file-based routes that own a path', () => {
    for (const slug of ['robots.txt', 'sitemap.xml', 'opengraph-image']) {
      expect(isReservedSlug(slug), slug).toBe(true);
    }
  });

  it('reserves /rentals ahead of the area landing pages', () => {
    // Claimed before those pages ship, the profile would be shadowed the day
    // they land — and the slug cannot be changed.
    expect(isReservedSlug('rentals')).toBe(true);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(isReservedSlug('  Dashboard  ')).toBe(true);
    expect(isReservedSlug('BACK-OFFICE')).toBe(true);
  });

  it('still allows an ordinary landlord slug', () => {
    for (const slug of ['perera-properties', 'colombo-homes-2', 'kandy-rentals']) {
      expect(isReservedSlug(slug), slug).toBe(false);
    }
  });
});
