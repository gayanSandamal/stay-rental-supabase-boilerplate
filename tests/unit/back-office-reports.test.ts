import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgres://test:test@127.0.0.1:1/test';
});
vi.mock('server-only', () => ({}));

import {
  colomboDayStart,
  csvCell,
  localPhone,
  reportFileName,
  toCsv,
} from '@/lib/back-office/reports/csv';
import { parseReportFilters } from '@/lib/back-office/reports/filters';
import { REPORTS, availableReports, findReport } from '@/lib/back-office/reports';
import { followUpFor, missingDetails } from '@/lib/back-office/reports/import-follow-up';
import { featureFlagDefaults, type FeatureFlags } from '@/lib/feature-flags';

const NOW = new Date('2026-11-29T08:35:33Z');

describe('report files', () => {
  it('are named with the Sri Lankan date and time', () => {
    expect(reportFileName('import-follow-up', NOW)).toBe('import-follow-up_2026-11-29_14-05-33.csv');
    expect(reportFileName('x', new Date('2026-11-29T20:00:00Z'))).toBe('x_2026-11-30_01-30-00.csv');
  });

  it('cannot execute in a spreadsheet, and quote what needs quoting', () => {
    for (const evil of ['=HYPERLINK("x")', '+94771234567', '-1+1', '@SUM(A1)', '\tx']) {
      expect(csvCell(evil).replace(/^"/, '').startsWith("'")).toBe(true);
    }
    expect(csvCell('a, "b"\nc')).toBe('"a, ""b""\nc"');
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell(null)).toBe('');
    expect(toCsv(['මාතෘකාව'], [['ගෙදර']]).startsWith('\uFEFF')).toBe(true);
  });

  it('write numbers a phone can dial and Excel will not eat', () => {
    expect(localPhone('+94771234567')).toBe('077 123 4567');
    expect(localPhone('+447911123456')).toBe('00447911123456');
    expect(csvCell(localPhone('+94771234567'))).toBe('077 123 4567');
  });
});

describe('report filters', () => {
  const report = REPORTS[0];
  it('are Colombo days, inclusive at both ends', () => {
    const f = parseReportFilters(report, { view: 'all', from: '2026-11-29', to: '2026-11-29' });
    expect(f.from!.toISOString()).toBe('2026-11-28T18:30:00.000Z');
    expect(f.to!.toISOString()).toBe('2026-11-29T18:30:00.000Z');
  });
  it('ignore nonsense', () => {
    for (const bad of ['', 'x', '2026-13-01', '2026-02-31', "2026-01-01';--"]) {
      expect(colomboDayStart(bad)).toBeNull();
    }
    expect(parseReportFilters(report, { view: 'nope' }).view).toBe(report.views[0].key);
  });
});

describe('import follow-up', () => {
  const base = {
    status: 'draft',
    hasPost: true,
    missing: [] as string[],
    ownerPhoneIsWhatsApp: true,
    consentOutcome: null,
    consentRequestedAt: null,
    notifyOutcome: null,
    listingStatus: null,
  };
  const step = (over: Partial<typeof base> | Record<string, unknown>) =>
    followUpFor({ ...base, ...over } as typeof base, NOW);

  it('names the next step', () => {
    expect(step({ missing: ['rent', 'phone number'] })).toBe('Complete the draft: rent, phone number');
    expect(step({})).toBe('Ask the owner for consent');
    expect(step({ hasPost: false })).toMatch(/publish/);
    expect(step({ ownerPhoneIsWhatsApp: false })).toMatch(/Call the owner/);
    expect(step({ status: 'awaiting_consent', consentOutcome: 'failed' })).toMatch(/call the owner/);
    expect(step({ status: 'published', listingStatus: 'expired' })).toMatch(/still available/);
    expect(step({ status: 'published', listingStatus: 'active', notifyOutcome: 'dry_run' })).toMatch(/Tell the owner/);
    expect(step({ status: 'published', listingStatus: 'active', notifyOutcome: 'sent' })).toBe('None');
    expect(step({ status: 'published', listingStatus: 'rented' })).toBe('None');
    expect(step({ status: 'discarded' })).toBe('None');
  });

  it('never prompts a second message to an owner who has not answered', () => {
    expect(
      step({ status: 'awaiting_consent', consentOutcome: 'sent', consentRequestedAt: new Date('2026-11-26T08:00:00Z') })
    ).toBe('Waiting for a reply (3 days) - do not message again');
  });

  it('lists what a draft still needs', () => {
    expect(missingDetails({ title: 'T', city: null, bedrooms: 0, rentPerMonth: null }, null)).toEqual([
      'town',
      'rent',
      'phone number',
    ]);
  });

  it('excludes owners who declined from every view', () => {
    const src = readFileSync('lib/back-office/reports/import-follow-up.ts', 'utf8');
    expect(src).toContain("ne(postImports.status, 'declined')");
  });

  it('carries the post link and every number', () => {
    const keys = REPORTS.find((r) => r.id === 'import-follow-up')!.columns.map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(['postUrl', 'ownerPhone', 'whatsApp', 'otherPhones', 'followUp']));
  });
});

describe('report availability', () => {
  it('follows the flags', () => {
    const flags = (over: Record<string, boolean>) =>
      ({ ...featureFlagDefaults, enableDataExport: true, enableFacebookImport: true, ...over }) as unknown as FeatureFlags;
    const on = flags({});
    expect(findReport('import-follow-up', on)).not.toBeNull();
    expect(findReport('import-follow-up', flags({ enableFacebookImport: false }))).toBeNull();
    expect(availableReports(flags({ enableDataExport: false }))).toEqual([]);
    expect(findReport('nope', on)).toBeNull();
  });

  it('report ids are unique and safe in a URL and a file name', () => {
    const ids = REPORTS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });
});

describe('after publishing or discarding', () => {
  it('lands on a blank import form', () => {
    const src = readFileSync('app/(dashboard)/back-office/imports/actions.ts', 'utf8');
    expect(src.match(/\/new\?published=\$\{id\}/g)).toHaveLength(2);
    expect(src).toContain('/new?discarded=${id}');
  });
});
