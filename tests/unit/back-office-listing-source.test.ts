import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LISTING_SOURCES,
  LISTING_SOURCE_LABELS,
  classifySource,
  isListingSource,
} from '@/lib/back-office/listing-source';

/**
 * Back Office → Listings used to be scoped to business-account listings only,
 * so with no agency accounts in use it was permanently empty (2026-11-05).
 */
describe('listing source buckets', () => {
  it('import beats WhatsApp beats business beats direct', () => {
    expect(classifySource({ hasImport: true, hasIntake: true, businessAccountId: 3 })).toBe('imported');
    expect(classifySource({ hasImport: false, hasIntake: true, businessAccountId: 3 })).toBe('whatsapp');
    expect(classifySource({ hasImport: false, hasIntake: false, businessAccountId: 3 })).toBe('business');
    expect(classifySource({ hasImport: false, hasIntake: false, businessAccountId: null })).toBe('direct');
  });

  it('every bucket has a label and only known values parse', () => {
    for (const s of LISTING_SOURCES) expect(LISTING_SOURCE_LABELS[s]).toBeTruthy();
    expect(isListingSource('whatsapp')).toBe(true);
    expect(isListingSource('business')).toBe(true);
    expect(isListingSource("direct' or 1=1")).toBe(false);
    expect(isListingSource(undefined)).toBe(false);
  });
});

describe('Back Office → Listings page', () => {
  const page = readFileSync(join(process.cwd(), 'app/(dashboard)/back-office/listings/page.tsx'), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('is no longer scoped to business-account listings', () => {
    expect(page).not.toMatch(/isNotNull\(listings\.businessAccountId\)/);
    expect(page).not.toMatch(/Business Account Listings/);
  });

  it('keeps the ?businessAccountId= deep link from a business account', () => {
    expect(page).toMatch(/extraKeys: \['businessAccountId', 'source'\]/);
    expect(page).toMatch(/eq\(listings\.businessAccountId, businessAccountId\)/);
  });

  it('never runs queries concurrently (max: 1 pool)', () => {
    expect(page).not.toMatch(/Promise\.all/);
  });
});
