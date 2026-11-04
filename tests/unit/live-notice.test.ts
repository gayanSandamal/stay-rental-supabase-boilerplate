import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  LIVE_TEMPLATE_PARAM_COUNT,
  LIVE_TEMPLATE_TEXT,
  daysLive,
  liveTemplateParams,
  renderLiveText,
} from '@/lib/listings/live-notice';
import { whatsappTemplateName } from '@/lib/intake/channels/whatsapp/send';

/**
 * The "your listing is live" notice ops approval sends. It must be a template:
 * free-form outside the 24-hour window is rejected, and re-approving an expired
 * listing is always outside it.
 */
const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-11-04T10:00:00Z');

describe('LIVE_TEMPLATE_TEXT contract', () => {
  it('declares exactly LIVE_TEMPLATE_PARAM_COUNT variables, numbered 1..n', () => {
    const declared = [...LIVE_TEMPLATE_TEXT.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    expect(new Set(declared).size).toBe(LIVE_TEMPLATE_PARAM_COUNT);
    expect(Math.max(...declared)).toBe(LIVE_TEMPLATE_PARAM_COUNT);
  });

  it('stays clear of promotional wording that would make Meta file it as Marketing', () => {
    expect(LIVE_TEMPLATE_TEXT).not.toMatch(/free|commission|offer|discount|boost|featured/i);
  });

  it('does not start or end with a variable (Meta refuses those)', () => {
    expect(LIVE_TEMPLATE_TEXT.trim()).not.toMatch(/^\{\{|\}\}$/);
  });
});

describe('liveTemplateParams', () => {
  const base = { listingTitle: '2BR House in Nugegoda', now, expirationDays: 30 };

  it('returns exactly the declared number of values, none empty', () => {
    for (const ownerName of [null, '', 'Property owner', 'Nimal Perera']) {
      for (const listingTitle of ['', '  ', base.listingTitle]) {
        const params = liveTemplateParams({ ...base, ownerName, listingTitle, expiresAt: null });
        expect(params).toHaveLength(LIVE_TEMPLATE_PARAM_COUNT);
        for (const p of params) expect(p.trim()).not.toBe('');
      }
    }
  });

  it('greets by first name, and a nameless owner as "there"', () => {
    expect(liveTemplateParams({ ...base, ownerName: 'Nimal Perera', expiresAt: null })[0]).toBe('Nimal');
    expect(liveTemplateParams({ ...base, ownerName: 'Property owner', expiresAt: null })[0]).toBe('there');
  });

  it('counts the days to expiry', () => {
    const params = liveTemplateParams({
      ...base,
      ownerName: 'Nimal',
      expiresAt: new Date(now.getTime() + 30 * DAY),
    });
    expect(params[2]).toBe('30');
  });

  it('renders with no placeholder left over', () => {
    const params = liveTemplateParams({ ...base, ownerName: 'Nimal', expiresAt: null });
    expect(renderLiveText(params, 'https://easyrent.lk/listings/1')).not.toMatch(/\{\{\d+\}\}/);
  });
});

describe('daysLive', () => {
  it('never says 0 days', () => {
    expect(daysLive(new Date(now.getTime() + 60 * 1000), now, 30)).toBe(1);
    expect(daysLive(new Date(now.getTime() - DAY), now, 30)).toBe(1);
  });

  it('falls back to the flag, then 30, with no expiry', () => {
    expect(daysLive(null, now, 14)).toBe(14);
    expect(daysLive(null, now, Number.NaN)).toBe(30);
  });
});

describe('template name', () => {
  const original = process.env.WHATSAPP_LIVE_TEMPLATE;
  afterEach(() => {
    if (original === undefined) delete process.env.WHATSAPP_LIVE_TEMPLATE;
    else process.env.WHATSAPP_LIVE_TEMPLATE = original;
  });

  it('reads WHATSAPP_LIVE_TEMPLATE, and is null when unset', () => {
    delete process.env.WHATSAPP_LIVE_TEMPLATE;
    expect(whatsappTemplateName('live')).toBeNull();
    process.env.WHATSAPP_LIVE_TEMPLATE = 'listing_live_notice';
    expect(whatsappTemplateName('live')).toBe('listing_live_notice');
  });
});

function code(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('PATCH /api/listings/[id] approval notice', () => {
  const route = code('app/api/listings/[id]/route.ts');

  it('sends the live template when one is configured', () => {
    expect(route).toContain("whatsappTemplateName('live')");
    expect(route).toMatch(/sendWhatsAppTemplate\(intake\.fromNumber/);
    expect(route).toContain('liveTemplateParams(');
  });

  it('sends free-form text only when no template is configured', () => {
    const branch = route.indexOf('if (liveTemplate) {');
    const elseBranch = route.indexOf('} else {', branch);
    const text = route.indexOf('sendWhatsAppText(intake.fromNumber');
    expect(branch).toBeGreaterThanOrEqual(0);
    expect(text).toBeGreaterThan(elseBranch);
    expect(route.match(/sendWhatsAppText\(/g) ?? []).toHaveLength(1);
  });
});
