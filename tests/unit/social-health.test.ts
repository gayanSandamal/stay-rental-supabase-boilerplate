import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The credential probe exists because "the env var is set" was reported to ops
 * as "live" through two separate production faults:
 *
 *   · FACEBOOK_PAGE_ID holding the App ID  → every post failed "does not exist"
 *   · a Page token minted from a SHORT-LIVED user token → died after 19 hours
 *
 * These tests pin the mapping from Graph's answers to the operator action, and
 * — just as importantly — that an unconfigured platform makes NO network call.
 */

const graphGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/social/adapters/graph', async (importOriginal) => {
  // Keep the real isTokenError/isPermissionError classifiers; only the network
  // call is faked, so the tests exercise the true code→meaning mapping.
  const actual = await importOriginal<typeof import('@/lib/social/adapters/graph')>();
  return { ...actual, graphGet };
});

// The TikTok branch reaches the DB; these cases never configure TikTok, so it
// short-circuits before the lazy import.
const ENV_KEYS = [
  'FACEBOOK_PAGE_ID',
  'FACEBOOK_PAGE_ACCESS_TOKEN',
  'INSTAGRAM_BUSINESS_ACCOUNT_ID',
  'FACEBOOK_APP_ID',
  'FACEBOOK_APP_SECRET',
  'TIKTOK_CLIENT_KEY',
  'TIKTOK_CLIENT_SECRET',
] as const;

const saved: Record<string, string | undefined> = {};

async function runCheck() {
  // Fresh module each time: the probe caches per instance for 60s.
  vi.resetModules();
  const { checkSocialCredentials } = await import('@/lib/social/health');
  return checkSocialCredentials(true);
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  graphGet.mockReset();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('unconfigured platforms', () => {
  it('report configured:false and make no network call', async () => {
    const health = await runCheck();

    expect(health.facebook_page).toMatchObject({ configured: false });
    expect(health.instagram).toMatchObject({ configured: false });
    expect(health.tiktok).toMatchObject({ configured: false });
    // `valid` must stay undefined — absent is not the same as broken.
    expect(health.facebook_page.valid).toBeUndefined();
    // The whole point of the dormancy contract: no credentials, no traffic.
    expect(graphGet).not.toHaveBeenCalled();
  });

  it('always marks Facebook Group as manual — there is no API to check', async () => {
    const health = await runCheck();
    expect(health.facebook_group.manual).toBe(true);
  });
});

describe('Facebook Page', () => {
  beforeEach(() => {
    process.env.FACEBOOK_PAGE_ID = '1229347226919525';
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = 'page-token';
  });

  it('reports an expired token as the regeneration step, not a raw error', async () => {
    graphGet.mockResolvedValueOnce({
      ok: false,
      error: {
        message: 'Error validating access token: Session has expired on Saturday…',
        code: 190,
        subcode: 463,
      },
    });

    const { facebook_page: fb } = await runCheck();
    expect(fb.valid).toBe(false);
    expect(fb.error).toMatch(/regenerate a non-expiring Page token/);
    // Never leak the credential into something that gets rendered.
    expect(JSON.stringify(fb)).not.toContain('page-token');
  });

  it('names the env var when the ID does not resolve (the App-ID mistake)', async () => {
    graphGet.mockResolvedValueOnce({
      ok: false,
      error: { message: "Object with ID '1423639322950388' does not exist", code: 100 },
    });

    const { facebook_page: fb } = await runCheck();
    expect(fb.valid).toBe(false);
    expect(fb.error).toMatch(/FACEBOOK_PAGE_ID/);
    expect(fb.error).toMatch(/App ID will not work/);
  });

  it('reads expires_at:0 as "never expires"', async () => {
    graphGet
      .mockResolvedValueOnce({ ok: true, data: { id: '1229347226919525', name: 'Easy Rent' } })
      .mockResolvedValueOnce({ ok: true, data: { data: { expires_at: 0, is_valid: true } } });

    const { facebook_page: fb } = await runCheck();
    expect(fb.valid).toBe(true);
    expect(fb.accountName).toBe('Easy Rent');
    // null, NOT undefined: "never" is a known answer, "unknown" is not.
    expect(fb.expiresAt).toBeNull();
  });

  it('surfaces a real expiry as a Date', async () => {
    // The token that actually broke production: 1787425200 = 22-Aug-26 19:00 UTC.
    graphGet
      .mockResolvedValueOnce({ ok: true, data: { id: '1229347226919525', name: 'Easy Rent' } })
      .mockResolvedValueOnce({
        ok: true,
        data: { data: { expires_at: 1787425200, is_valid: true } },
      });

    const { facebook_page: fb } = await runCheck();
    expect(fb.expiresAt).toBeInstanceOf(Date);
    expect((fb.expiresAt as Date).toISOString()).toBe('2026-08-22T19:00:00.000Z');
  });

  it('leaves expiry undefined when debug_token refuses, without failing the check', async () => {
    graphGet
      .mockResolvedValueOnce({ ok: true, data: { id: '1229347226919525', name: 'Easy Rent' } })
      // Meta rejects debug_token unless the caller is an app or app developer.
      .mockResolvedValueOnce({
        ok: false,
        error: { message: 'You must provide an app access token', code: 100 },
      });

    const { facebook_page: fb } = await runCheck();
    // Still healthy — we simply could not read the expiry.
    expect(fb.valid).toBe(true);
    expect(fb.expiresAt).toBeUndefined();
  });
});

describe('Instagram', () => {
  it('confirms the account is reachable through the Page token', async () => {
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = '17841400000000000';
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = 'page-token';

    graphGet.mockResolvedValueOnce({
      ok: true,
      data: { id: '17841400000000000', username: 'easyrent.lk' },
    });

    const { instagram } = await runCheck();
    expect(instagram.valid).toBe(true);
    expect(instagram.accountName).toBe('@easyrent.lk');
  });

  it('names its own env var when the ID is wrong', async () => {
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = '999';
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = 'page-token';

    graphGet.mockResolvedValueOnce({
      ok: false,
      error: { message: "Object with ID '999' does not exist", code: 100 },
    });

    const { instagram } = await runCheck();
    expect(instagram.error).toMatch(/INSTAGRAM_BUSINESS_ACCOUNT_ID/);
  });
});

describe('fail-soft', () => {
  it('a thrown check reports unknown rather than invalid', async () => {
    process.env.FACEBOOK_PAGE_ID = '123';
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = 'page-token';
    graphGet.mockRejectedValueOnce(new Error('socket hang up'));

    const { facebook_page: fb } = await runCheck();
    // An unreachable Graph is not proof of a bad credential. Reporting `false`
    // would send ops to rotate a perfectly good token.
    expect(fb.valid).toBeUndefined();
    expect(fb.error).toBe('socket hang up');
  });
});

describe('summariseCredentialHealth', () => {
  it('renders never-expiring as "never" and omits an unknown expiry', async () => {
    vi.resetModules();
    const { summariseCredentialHealth } = await import('@/lib/social/health');

    const summary = summariseCredentialHealth({
      facebook_page: { platform: 'facebook_page', configured: true, valid: true, expiresAt: null },
      instagram: { platform: 'instagram', configured: true, valid: true },
      tiktok: { platform: 'tiktok', configured: false },
      facebook_group: { platform: 'facebook_group', configured: true, manual: true },
    }) as Record<string, { expiresAt?: string }>;

    expect(summary.facebook_page.expiresAt).toBe('never');
    expect(summary.instagram.expiresAt).toBeUndefined();
  });
});

describe('platformStatusLine — what ops actually reads', () => {
  const base = { platform: 'facebook_page', configured: true } as const;
  // 22-Aug-26 19:31 UTC — the moment Graph reported the session expired.
  const NOW = Date.parse('2026-08-22T19:31:00Z');

  async function line(health: Record<string, unknown>, enabled = true) {
    vi.resetModules();
    const { platformStatusLine } = await import('@/lib/social/health');
    return platformStatusLine(health as never, enabled, NOW);
  }

  it('THE REGRESSION: a configured platform with a dead token is never "live"', async () => {
    const status = await line({
      ...base,
      valid: false,
      error: 'token expired or revoked (Graph 190) — regenerate a non-expiring Page token',
    });
    expect(status.tone).toBe('bad');
    expect(status.text).not.toMatch(/live/);
    expect(status.text).toMatch(/regenerate a non-expiring Page token/);
  });

  it('warns BEFORE a short-lived-derived token dies', async () => {
    // 1787425200 = 22-Aug-26 19:00 UTC. Ask 19 hours earlier, as the panel
    // would have the evening this token was deployed.
    const health = { ...base, valid: true, expiresAt: new Date(1787425200 * 1000) };
    const status = await line(health, true);
    // At NOW it is already gone; the warning path is the hour before.
    expect(status.tone).toBe('bad');

    vi.resetModules();
    const { platformStatusLine } = await import('@/lib/social/health');
    const earlier = platformStatusLine(health as never, true, NOW - 19 * 60 * 60 * 1000);
    expect(earlier.tone).toBe('warn');
    expect(earlier.text).toMatch(/expires in 18h/);
  });

  it('reports a never-expiring token as live, with the account name', async () => {
    const status = await line({
      ...base,
      valid: true,
      accountName: 'Easy Rent',
      expiresAt: null,
    });
    expect(status.tone).toBe('ok');
    expect(status.text).toBe('— live · Easy Rent · token never expires');
  });

  it('distinguishes "unverified" from both healthy and broken', async () => {
    const status = await line({ ...base, valid: undefined, error: 'socket hang up' });
    expect(status.tone).toBe('warn');
    expect(status.text).toMatch(/unverified/);
    expect(status.text).not.toMatch(/live/);
  });

  it('keeps the dry-run wording for an unconfigured platform', async () => {
    const status = await line({ platform: 'instagram', configured: false });
    expect(status.text).toMatch(/DRY RUNS/);
  });

  it('a switched-off platform reports off, whatever its credentials say', async () => {
    const status = await line({ ...base, valid: false, error: 'token expired' }, false);
    expect(status.tone).toBe('off');
    expect(status.text).toBe('— switched off');
  });
});
