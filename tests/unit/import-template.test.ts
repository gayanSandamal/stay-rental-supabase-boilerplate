import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  IMPORT_TEMPLATE_PARAM_COUNT,
  IMPORT_TEMPLATE_TEXT,
  greetingName,
  importTemplateParams,
} from '@/lib/imports/message';
import { sanitizeTemplateParam } from '@/lib/intake/channels/whatsapp/send';

/**
 * The template body is registered with Meta, not with us. A variable count that
 * drifts from the approved text starts failing for EVERY recipient at once,
 * with nothing failing locally to warn you — so code and template are held in
 * agreement here, exactly as landlord-reports.test.ts does for the report.
 */

const base = {
  ownerName: 'Nimal Perera',
  listingTitle: '3BR House in Nugegoda',
  city: 'Nugegoda',
  ownerPhone: '+94771234567',
};

describe('template contract', () => {
  it('declares exactly the variables the body uses', () => {
    const declared = new Set(
      [...IMPORT_TEMPLATE_TEXT.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]))
    );
    expect(declared.size).toBe(IMPORT_TEMPLATE_PARAM_COUNT);
    // Meta numbers body variables from 1 with no gaps.
    for (let i = 1; i <= IMPORT_TEMPLATE_PARAM_COUNT; i++) {
      expect(declared.has(i)).toBe(true);
    }
  });

  it('produces exactly that many parameters', () => {
    expect(importTemplateParams(base)).toHaveLength(IMPORT_TEMPLATE_PARAM_COUNT);
  });
});

describe('parameter rules Meta enforces', () => {
  /*
   * Meta rejects a body parameter containing a newline, a tab, or 5+
   * consecutive spaces. The layout has to live in the approved text.
   */
  const forbidden = /[\n\t]|\s{5,}/;

  it('never emits a newline, tab, or long space run', () => {
    for (const value of importTemplateParams(base)) {
      expect(value).not.toMatch(forbidden);
    }
  });

  it('survives a hostile listing title', () => {
    const params = importTemplateParams({
      ...base,
      listingTitle: 'House\n\nin\t\tNugegoda      with     space',
    });
    for (const value of params.map(sanitizeTemplateParam)) {
      expect(value).not.toMatch(forbidden);
    }
  });

  /*
   * Meta rejects the whole send if a declared variable resolves to an empty
   * string, so "no city recorded" has to render as words rather than nothing.
   */
  it('never emits an empty parameter, whatever is missing', () => {
    const params = importTemplateParams({
      ownerName: null,
      listingTitle: '   ',
      city: null,
      ownerPhone: '+94771234567',
    });
    expect(params).toHaveLength(IMPORT_TEMPLATE_PARAM_COUNT);
    for (const value of params) {
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('greeting', () => {
  it('uses the first name only', () => {
    expect(greetingName('Nimal Perera Jayawardena')).toBe('Nimal');
  });

  it('falls back to "there" rather than a placeholder', () => {
    // "Hi Property owner" reads as a mailmerge failure to the one person
    // guaranteed to read it.
    expect(greetingName(null)).toBe('there');
    expect(greetingName('  ')).toBe('there');
    expect(greetingName('Property owner')).toBe('there');
  });
});

describe('delivery rules', () => {
  function code(relativePath: string): string {
    return readFileSync(join(process.cwd(), relativePath), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
  }

  /*
   * The recipient has never messaged us — that is the premise of importing
   * their ad — so there is no 24-hour customer-service window and free-form
   * text is rejected outright (error 131047). A "fall back to sendWhatsAppText
   * when the template fails" repair cannot succeed, and repeated failed
   * business-initiated sends degrade the WABA quality rating that every OTHER
   * landlord's messages depend on.
   */
  it('never sends the owner notification as free-form text', () => {
    const source = code('lib/imports/notify.ts');
    expect(source).toContain('sendWhatsAppTemplate');
    expect(source).not.toContain('sendWhatsAppText');
  });

  /*
   * On Vercel the pool is max: 1 against Supabase's transaction pooler, and
   * concurrent queries on that connection wedge the request (commit a3ac4f9).
   */
  it('publishes with no concurrent queries', () => {
    expect(code('lib/imports/publish.ts')).not.toContain('Promise.all');
  });

  /*
   * The whole point of the 0057 column. An imported owner's number is known,
   * not proven, and the reports job must not treat the two as the same.
   */
  it('gates scheduled reports on proven possession, not on having a number', () => {
    expect(code('lib/reports/send.ts')).toContain('isNotNull(users.waPhoneVerifiedAt)');
  });
});
