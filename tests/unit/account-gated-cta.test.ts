import { describe, expect, it } from 'vitest';
import { accountGatedHref } from '@/lib/auth/cta';

const QUICK_FORM = '/dashboard/listings/new?mode=quick';

describe('accountGatedHref', () => {
  it('sends a signed-in visitor straight to the destination', () => {
    // The bug this guards: a landlord who already has an account clicking
    // "Start the 60-second form" and landing on the sign-up page instead.
    expect(accountGatedHref(true, QUICK_FORM)).toBe(QUICK_FORM);
  });

  it('routes an anonymous visitor through sign-up', () => {
    expect(accountGatedHref(false, QUICK_FORM)).toMatch(/^\/sign-up\?redirect=/);
  });

  it('encodes a destination that carries its own query string', () => {
    // Raw, everything after the destination's `?` is parsed as a parameter of
    // /sign-up and the mode is silently dropped.
    const href = accountGatedHref(false, QUICK_FORM);
    expect(href).toBe(
      '/sign-up?redirect=%2Fdashboard%2Flistings%2Fnew%3Fmode%3Dquick'
    );
    expect(href.indexOf('?')).toBe(href.lastIndexOf('?'));
  });

  it('round-trips through URL parsing back to the exact destination', () => {
    const href = accountGatedHref(false, QUICK_FORM);
    const parsed = new URL(href, 'https://easyrent.lk');
    expect(parsed.searchParams.get('redirect')).toBe(QUICK_FORM);
  });

  it('leaves a destination without a query string readable', () => {
    expect(accountGatedHref(false, '/dashboard/listings/new')).toBe(
      '/sign-up?redirect=%2Fdashboard%2Flistings%2Fnew'
    );
  });
});
