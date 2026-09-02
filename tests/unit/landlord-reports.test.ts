import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  isReportDue,
  isReportFrequency,
  reportPeriodFor,
} from '@/lib/reports/period';
import {
  REPORT_TEMPLATE_PARAM_COUNT,
  REPORT_TEMPLATE_TEXT,
  buildNudge,
  greetingName,
  renderReportText,
  reportTemplateParams,
} from '@/lib/reports/message';
import { sanitizeTemplateParam } from '@/lib/intake/channels/whatsapp/send';
import { detectCommand } from '@/lib/intake/command-words';
import { canChooseDaily, effectiveReportFrequency } from '@/lib/reports/prefs';
import type { LandlordReportData } from '@/lib/reports/data';

vi.mock('@/lib/feature-flags', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/feature-flags')>();
  return { ...actual, isFeatureEnabled: vi.fn(() => false) };
});
import { isFeatureEnabled } from '@/lib/feature-flags';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = new Date('2026-09-01T04:00:00Z');

const data = (over: Partial<LandlordReportData> = {}): LandlordReportData => ({
  listings: [],
  totalListings: 2,
  activeListings: 2,
  totalViews: 40,
  previousViews: 30,
  changePct: 33,
  topListing: {
    id: 1,
    title: '3BR House in Nugegoda',
    status: 'active',
    city: 'Nugegoda',
    bedrooms: 3,
    rentPerMonth: 120_000,
    expiresAt: null,
    views: 25,
    previousViews: 20,
  },
  zeroViewActive: 0,
  expiringSoon: 0,
  expiredListings: 0,
  ...over,
});

beforeEach(() => {
  vi.mocked(isFeatureEnabled).mockReturnValue(false);
});

describe('report cadence', () => {
  it('accepts only the three known frequencies', () => {
    expect(isReportFrequency('weekly')).toBe(true);
    expect(isReportFrequency('daily')).toBe(true);
    expect(isReportFrequency('off')).toBe(true);
    expect(isReportFrequency('hourly')).toBe(false);
    expect(isReportFrequency(null)).toBe(false);
  });

  it('never sends when switched off', () => {
    expect(isReportDue('off', null, NOW)).toBe(false);
    expect(isReportDue('off', new Date('2020-01-01'), NOW)).toBe(false);
  });

  it('is due immediately when no report has ever been sent', () => {
    expect(isReportDue('weekly', null, NOW)).toBe(true);
    expect(isReportDue('daily', null, NOW)).toBe(true);
  });

  /**
   * The regression this guards: a strict >= 24h test against a timestamp the
   * cron writes a few seconds later each day skips every other run, turning a
   * daily report into an every-other-day one.
   */
  it('stays due despite the cron drifting a few seconds later each day', () => {
    const yesterday = new Date(NOW.getTime() - DAY + 3000);
    expect(isReportDue('daily', yesterday, NOW)).toBe(true);

    const lastWeek = new Date(NOW.getTime() - 7 * DAY + 3000);
    expect(isReportDue('weekly', lastWeek, NOW)).toBe(true);
  });

  it('does not send a weekly report twice in the same week', () => {
    expect(isReportDue('weekly', new Date(NOW.getTime() - 2 * DAY), NOW)).toBe(false);
  });

  it('does not send a daily report twice in the same day', () => {
    expect(isReportDue('daily', new Date(NOW.getTime() - 2 * HOUR), NOW)).toBe(false);
  });
});

describe('report period', () => {
  it('caps a first report so its number matches its heading', () => {
    const period = reportPeriodFor('weekly', null, NOW);
    expect(period.start.getTime()).toBe(NOW.getTime() - 7 * DAY);
    expect(period.label).toBe('the last 7 days');
  });

  it('covers the gap after a missed run instead of dropping those days', () => {
    const twoDaysAgo = new Date(NOW.getTime() - 2 * DAY);
    const period = reportPeriodFor('daily', twoDaysAgo, NOW);
    expect(period.start).toEqual(twoDaysAgo);
    // The label follows the real window — a 2-day report never says "24 hours".
    expect(period.label).toBe('the last 2 days');
  });

  it('compares against an equally long preceding window', () => {
    const period = reportPeriodFor('weekly', null, NOW);
    expect(period.start.getTime() - period.previousStart.getTime()).toBe(
      period.end.getTime() - period.start.getTime()
    );
  });

  it('bounds recovery after a long outage, and labels the real window', () => {
    const period = reportPeriodFor('weekly', new Date(NOW.getTime() - 90 * DAY), NOW);
    // Clamped to the recovery ceiling (4 nominal intervals), not to the
    // first-report lookback — and the heading says 28 days, not "7 days".
    expect(period.start.getTime()).toBe(NOW.getTime() - 28 * DAY);
    expect(period.label).toBe('the last 28 days');
  });

  it('recovers a missed daily run without dropping the missed day', () => {
    const period = reportPeriodFor('daily', new Date(NOW.getTime() - 3 * DAY), NOW);
    expect(period.start.getTime()).toBe(NOW.getTime() - 3 * DAY);
  });
});

describe('plan gating', () => {
  const landlord = (over: Record<string, unknown> = {}) =>
    ({ id: 1, landlordPlanTier: 'free', reportFrequency: 'weekly', ...over }) as never;

  it('reserves daily for paid plans', () => {
    expect(canChooseDaily(landlord({ landlordPlanTier: 'free' }))).toBe(false);
    expect(canChooseDaily(landlord({ landlordPlanTier: 'starter' }))).toBe(true);
    expect(canChooseDaily(landlord({ landlordPlanTier: 'pro' }))).toBe(true);
    expect(canChooseDaily(landlord({ landlordPlanTier: 'agency' }))).toBe(true);
  });

  /**
   * The billing regression: a lapsed plan whose stored preference is still
   * 'daily' would otherwise keep sending 30 billable templates a month.
   */
  it('falls back to weekly when a plan has lapsed, keeping the stored choice', () => {
    const lapsed = landlord({
      landlordPlanTier: 'pro',
      landlordPlanExpiresAt: new Date('2026-01-01'),
      reportFrequency: 'daily',
    });
    expect(effectiveReportFrequency(lapsed)).toBe('weekly');
  });

  it('honours an opt-out regardless of plan', () => {
    expect(
      effectiveReportFrequency(landlord({ landlordPlanTier: 'agency', reportFrequency: 'off' }))
    ).toBe('off');
  });

  it('defaults an unset preference to weekly', () => {
    expect(effectiveReportFrequency(landlord({ reportFrequency: null }))).toBe('weekly');
  });
});

describe('template contract', () => {
  it('supplies exactly as many params as the approved template declares', () => {
    const declared = [...REPORT_TEMPLATE_TEXT.matchAll(/\{\{(\d+)\}\}/g)].map((m) =>
      Number(m[1])
    );
    const highest = Math.max(...declared);
    expect(highest).toBe(REPORT_TEMPLATE_PARAM_COUNT);
    expect(new Set(declared).size).toBe(REPORT_TEMPLATE_PARAM_COUNT);

    const params = reportTemplateParams({
      name: 'Nimal',
      data: data(),
      period: reportPeriodFor('weekly', null, NOW),
      marketAvgRent: null,
    });
    expect(params).toHaveLength(REPORT_TEMPLATE_PARAM_COUNT);
  });

  /** Meta rejects a body parameter containing a newline, tab or 5+ spaces. */
  it('emits no parameter Meta would reject', () => {
    const params = reportTemplateParams({
      name: 'Nimal',
      data: data({ expiringSoon: 2 }),
      period: reportPeriodFor('weekly', null, NOW),
      marketAvgRent: 90_000,
    });
    for (const param of params) {
      expect(param).not.toMatch(/[\n\r\t]/);
      expect(param).not.toMatch(/ {5}/);
      expect(param.length).toBeGreaterThan(0);
    }
  });

  it('never leaves a parameter empty, even with nothing to report', () => {
    const params = reportTemplateParams({
      name: 'there',
      data: data({
        totalListings: 0,
        activeListings: 0,
        totalViews: 0,
        previousViews: 0,
        changePct: null,
        topListing: null,
      }),
      period: reportPeriodFor('weekly', null, NOW),
      marketAvgRent: null,
    });
    expect(params).toHaveLength(REPORT_TEMPLATE_PARAM_COUNT);
    params.forEach((p) => expect(p.trim()).not.toBe(''));
  });

  it('flattens anything Meta would reject in a parameter', () => {
    expect(sanitizeTemplateParam('two\nlines')).toBe('two lines');
    expect(sanitizeTemplateParam('a\t\tb')).toBe('a b');
    expect(sanitizeTemplateParam('')).toBe('-');
  });
});

describe('report copy', () => {
  it('greets by first name, never by email address', () => {
    expect(greetingName({ name: 'Nimal Perera Jayawardena' })).toBe('Nimal');
    expect(greetingName({ name: null })).toBe('there');
    expect(greetingName({ name: '  ' })).toBe('there');
  });

  it('does not invent a baseline for a first report', () => {
    const params = reportTemplateParams({
      name: 'Nimal',
      data: data({ changePct: null, previousViews: 0 }),
      period: reportPeriodFor('weekly', null, NOW),
      marketAvgRent: null,
    });
    expect(params[3]).not.toMatch(/0%/);
    expect(params[3]).toMatch(/no comparison yet/);
  });

  it('renders the same numbers in text as in the template', () => {
    const params = reportTemplateParams({
      name: 'Nimal',
      data: data({ totalViews: 40 }),
      period: reportPeriodFor('weekly', null, NOW),
      marketAvgRent: null,
    });
    const text = renderReportText(params);
    expect(text).toContain('Views: 40');
    expect(text).toContain('Hi Nimal');
  });
});

describe('the nudge', () => {
  it('puts an expiring listing above every other advice', () => {
    expect(buildNudge(data({ expiringSoon: 1, zeroViewActive: 2, changePct: -80 }), 50_000)).toMatch(
      /expires within 7 days/
    );
  });

  it('names the pricing gap when the market data is solid', () => {
    // 120,000 against a 90,000 average is 33% above.
    expect(buildNudge(data({ changePct: 0 }), 90_000)).toMatch(/33% above/);
  });

  it('skips the pricing nudge when there is no market average', () => {
    expect(buildNudge(data({ changePct: 0 }), null)).not.toMatch(/average/);
  });

  /**
   * While paid visibility is off the platform presents as fully free. A report
   * must not advertise a Boost nobody can buy.
   */
  it('never sells a Boost while paid visibility is switched off', () => {
    vi.mocked(isFeatureEnabled).mockReturnValue(false);
    expect(buildNudge(data({ changePct: -60 }), null)).not.toMatch(/Boost/i);
  });

  it('offers a Boost once paid visibility is live', () => {
    vi.mocked(isFeatureEnabled).mockReturnValue(true);
    expect(buildNudge(data({ changePct: -60 }), null)).toMatch(/Boost/);
  });

  it('gives exactly one piece of advice', () => {
    const nudge = buildNudge(data({ expiringSoon: 1, zeroViewActive: 3 }), 50_000);
    expect(nudge.split('. ').filter(Boolean).length).toBeLessThanOrEqual(2);
  });
});

describe('the STOP promise', () => {
  it('honours the exact word the template tells landlords to reply', () => {
    expect(detectCommand('STOP')).toBe('reports_off');
    expect(detectCommand('stop')).toBe('reports_off');
    expect(detectCommand('Stop reports')).toBe('reports_off');
    expect(detectCommand('unsubscribe')).toBe('reports_off');
  });

  it('lets a landlord turn reports back on', () => {
    expect(detectCommand('START REPORTS')).toBe('reports_on');
    expect(detectCommand('resume reports')).toBe('reports_on');
  });

  /** A real listing must never be read as a command. */
  it('does not swallow a listing that happens to start with a command word', () => {
    expect(detectCommand('stop by anytime, 3 rooms 45000 per month')).toBeNull();
    expect(detectCommand('no reports of damage, rent is 60000')).toBeNull();
  });

  it('leaves the other commands alone', () => {
    expect(detectCommand('DELETE')).toBe('delete');
    expect(detectCommand('LINK')).toBe('link');
    expect(detectCommand('help')).toBe('help');
  });
});
