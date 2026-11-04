import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { statusChangeFor, statusOptions } from '@/lib/listings/status-change';

/**
 * The back-office status dropdown on /dashboard/listings/[id] was a second,
 * weaker copy of the Approve & Activate and Reject Listing buttons: "Active"
 * skipped verification and "Rejected" skipped the reason, so the landlord was
 * never told. An expired listing also rendered as "Pending".
 */
describe('statusChangeFor', () => {
  it('Active goes through Approve & Activate, never a bare status PATCH', () => {
    expect(statusChangeFor('pending', 'active')).toEqual({ kind: 'approve' });
    expect(statusChangeFor('expired', 'active')).toEqual({ kind: 'approve' });
  });

  it('Rejected opens the reason dialog, never a bare status PATCH', () => {
    expect(statusChangeFor('pending', 'rejected')).toEqual({ kind: 'reject' });
    expect(statusChangeFor('active', 'rejected')).toEqual({ kind: 'reject' });
  });

  it('the remaining statuses are plain updates', () => {
    expect(statusChangeFor('active', 'rented')).toEqual({ kind: 'update', status: 'rented' });
    expect(statusChangeFor('active', 'archived')).toEqual({ kind: 'update', status: 'archived' });
    expect(statusChangeFor('rejected', 'pending')).toEqual({ kind: 'update', status: 'pending' });
  });

  it('re-picking the current value, or a cron-only status, does nothing', () => {
    expect(statusChangeFor('pending', 'pending')).toEqual({ kind: 'none' });
    expect(statusChangeFor('active', 'expired')).toEqual({ kind: 'none' });
  });
});

describe('statusOptions', () => {
  it('an expired listing shows Expired, not the first option', () => {
    const options = statusOptions('expired');
    expect(options.find((o) => o.value === 'expired')).toEqual({
      value: 'expired',
      label: 'Expired',
      disabled: true,
    });
  });

  it('every current status has a matching option', () => {
    for (const s of ['pending', 'active', 'rented', 'archived', 'rejected', 'expired']) {
      expect(statusOptions(s).some((o) => o.value === s)).toBe(true);
    }
  });

  it('expired is not offered while the listing is in another state', () => {
    expect(statusOptions('active').some((o) => o.value === 'expired')).toBe(false);
  });
});

describe('listing-approval-form', () => {
  const form = readFileSync(
    join(process.cwd(), 'app/(dashboard)/dashboard/listings/[id]/listing-approval-form.tsx'),
    'utf-8',
  );

  it('the dropdown routes through statusChangeFor instead of PATCHing what it is given', () => {
    expect(form).toMatch(/statusChangeFor\(listing\.status, newStatus\)/);
    expect(form).not.toMatch(/handleUpdate\(\{\s*status:\s*newStatus\s*\}\)/);
  });

  it('options come from statusOptions, not a hardcoded list', () => {
    expect(form).toMatch(/statusOptions\(listing\.status\)/);
    expect(form).not.toMatch(/<option value="active">/);
  });
});
