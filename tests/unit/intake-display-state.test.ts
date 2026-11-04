import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { listingStatusEnum } from '@/lib/db/schema';
import {
  CLOSED_STATES,
  intakeDisplayState,
  intakeDisplayStateSql,
} from '@/lib/intake/display-state';

/**
 * Back Office → WhatsApp Intakes counted intake #47 under "Published" while
 * its listing sat `pending` behind moderation (Approve & Activate still showing,
 * not visible to a single renter). `whatsapp_intakes.status = 'published'`
 * means the intake CREATED a listing; only `listings.status` says it is live.
 */

const NOW = new Date('2026-11-04T12:00:00Z');
const FUTURE = new Date('2026-12-04T12:00:00Z');
const PAST = new Date('2026-11-01T12:00:00Z');

function stateFor(listingStatus: string | null, listingExpiresAt: Date | null = FUTURE) {
  return intakeDisplayState({
    intakeStatus: 'published',
    listingStatus,
    listingExpiresAt,
    now: NOW,
  });
}

describe('intakeDisplayState', () => {
  it('a published intake whose listing is pending is awaiting review, never live', () => {
    expect(stateFor('pending')).toBe('awaiting_review');
    expect(stateFor('pending', null)).toBe('awaiting_review');
    expect(stateFor('pending')).not.toBe('live');
    expect(stateFor('pending')).not.toBe('published');
  });

  it('only an active, unexpired listing is live', () => {
    expect(stateFor('active', FUTURE)).toBe('live');
    expect(stateFor('active', null)).toBe('live');
    // Waiting on the expiry cron: not visible to renters, so not live.
    expect(stateFor('active', PAST)).toBe('expired');

    const liveFor = listingStatusEnum.enumValues.filter((s) => stateFor(s, FUTURE) === 'live');
    expect(liveFor).toEqual(['active']);
  });

  it('every non-live listing status lands in a named, non-published state', () => {
    expect(stateFor('expired')).toBe('expired');
    expect(stateFor('rejected')).toBe('listing_rejected');
    expect(stateFor('archived')).toBe('archived');
    expect(stateFor('rented')).toBe('rented');
    // Listing never linked, or purged by /api/cron/purge-archived.
    expect(stateFor(null)).toBe('no_listing');

    for (const s of listingStatusEnum.enumValues) {
      expect(stateFor(s)).not.toBe('published');
    }
  });

  it('closed states never overlap the live or awaiting-review tabs', () => {
    expect(CLOSED_STATES).not.toContain('live');
    expect(CLOSED_STATES).not.toContain('awaiting_review');
  });

  it('a non-published intake shows its own status whatever the listing says', () => {
    for (const intakeStatus of ['received', 'needs_info', 'manual_review', 'rejected']) {
      expect(
        intakeDisplayState({
          intakeStatus,
          listingStatus: 'active',
          listingExpiresAt: FUTURE,
          now: NOW,
        }),
      ).toBe(intakeStatus);
    }
  });
});

describe('intakeDisplayStateSql — the tabs and counts use the same rule', () => {
  const rendered = new PgDialect().sqlToQuery(intakeDisplayStateSql()).sql.replace(/\s+/g, ' ');

  it('maps a pending listing to awaiting_review', () => {
    expect(rendered).toContain(`when "listings"."status" = 'pending' then 'awaiting_review'`);
  });

  it('only calls a row live when the listing is active and unexpired', () => {
    const liveBranches = rendered.match(/when [^]*? then 'live'/g) ?? [];
    expect(liveBranches).toHaveLength(1);
    expect(rendered).toMatch(
      /when "listings"\."status" = 'active' and \("listings"\."expires_at" is null or "listings"\."expires_at" > now\(\)\) then 'live'/,
    );
  });

  it('never emits the bare word published as a display state', () => {
    expect(rendered).not.toMatch(/then 'published'/);
    // The only mention is the guard that sends non-published intakes through.
    expect(rendered).toContain(`"whatsapp_intakes"."status" <> 'published'`);
  });

  it('agrees with the JS rule for every listing status', () => {
    for (const s of listingStatusEnum.enumValues) {
      if (s === 'active') continue;
      expect(rendered).toContain(`when "listings"."status" = '${s}' then '${stateFor(s)}'`);
    }
  });
});

describe('WhatsApp Intakes screen', () => {
  const dir = 'app/(dashboard)/back-office/whatsapp-intakes';
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const page = strip(readFileSync(join(process.cwd(), dir, 'page.tsx'), 'utf-8'));
  const list = strip(readFileSync(join(process.cwd(), dir, 'intake-list.tsx'), 'utf-8'));

  it('never counts or filters on the intake status published alone', () => {
    expect(page).not.toMatch(/eq\(whatsappIntakes\.status,\s*'published'\)/);
    expect(page).not.toMatch(/whatsappIntakes\.status\}\s*=\s*'published'/);
    expect(page).not.toMatch(/'published'/);
  });

  it('joins listings in every query that uses the display state', () => {
    const joins =
      page.match(/\.leftJoin\(listings,\s*eq\(listings\.id,\s*whatsappIntakes\.listingId\)\)/g) ??
      [];
    // counts, rows, total
    expect(joins.length).toBe(3);
    expect(page).not.toMatch(/Promise\.all/);
  });

  it('badges show the derived state, not the raw intake status', () => {
    expect(list).not.toMatch(/<StatusBadge status=\{(row|open)\.status\}/);
    expect(list).toMatch(/<StatusBadge status=\{row\.state\}/);
    expect(list).toMatch(/<StatusBadge status=\{open\.state\}/);
  });
});
