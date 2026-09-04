import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Who can see the post is the one decision in this integration that must never
 * be made silently.
 *
 * TikTok's Direct Post rules put it with the creator, so the ops review screen
 * asks and passes the answer down as `privacyLevel`. These tests pin the two
 * halves of honouring that: the chosen value reaches TikTok VERBATIM, and if
 * the account cannot offer it the publish FAILS rather than substituting
 * something else. Substituting up is a privacy breach; substituting down is a
 * lie to the operator who picked. Neither is a recoverable mistake once the
 * post is live.
 *
 * The cron path has no human, and is pinned here too: it must keep choosing the
 * most public level the account actually offers.
 */

const findFirst = vi.hoisted(() => vi.fn());

// The adapter opens a pool at module scope; only the DB is faked, so the real
// publish logic runs.
vi.mock('@/lib/db/drizzle', () => {
  const thenable = () => Promise.resolve([]);
  return {
    db: {
      query: { socialAccounts: { findFirst } },
      update: () => ({ set: () => ({ where: thenable }) }),
      insert: () => ({ values: () => ({ onConflictDoUpdate: thenable }) }),
    },
  };
});

const ENV = [
  'TIKTOK_CLIENT_KEY',
  'TIKTOK_CLIENT_SECRET',
  // Otherwise every publish here pays a real 3s poll sleep.
  'TIKTOK_POLL_INTERVAL_MS',
] as const;
const saved: Record<string, string | undefined> = {};

/** Every call TikTok saw, so the test can assert on the init payload. */
let calls: Array<{ path: string; body: Record<string, unknown> }>;

function mockTikTok(privacyOptions: string[]) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      calls.push({ path, body: JSON.parse(String(init?.body ?? '{}')) });

      const reply = (data: unknown) =>
        new Response(JSON.stringify({ data, error: { code: 'ok' } }), { status: 200 });

      if (path.endsWith('/creator_info/query/')) {
        return reply({ privacy_level_options: privacyOptions });
      }
      if (path.endsWith('/content/init/')) return reply({ publish_id: 'pub-1' });
      if (path.endsWith('/status/fetch/')) {
        return reply({
          status: 'PUBLISH_COMPLETE',
          publicaly_available_post_id: ['7300000000000000001'],
        });
      }
      return new Response('{}', { status: 404 });
    })
  );
}

const input = {
  listingId: 7,
  caption: '2-bedroom house for rent in Ganemulla',
  imageUrls: ['https://easyrent.lk/api/social/img/7/0.jpg'],
  listingUrl: 'https://easyrent.lk/listings/7',
};

async function publish(extra: Record<string, unknown> = {}) {
  vi.resetModules();
  const { tiktokAdapter } = await import('@/lib/social/adapters/tiktok');
  return tiktokAdapter.publish({ ...input, ...extra });
}

/** The payload actually sent to content/init. */
function initPayload() {
  const call = calls.find((c) => c.path.endsWith('/content/init/'));
  return call?.body as { post_info?: { privacy_level?: string }; media_type?: string } | undefined;
}

beforeEach(() => {
  for (const key of ENV) {
    saved[key] = process.env[key];
    process.env[key] = 'set';
  }
  process.env.TIKTOK_POLL_INTERVAL_MS = '1';
  findFirst.mockReset();
  // A linked account whose access token is nowhere near expiry, so the publish
  // path runs without a refresh round trip.
  findFirst.mockResolvedValue({
    accessToken: 'access',
    refreshToken: 'refresh',
    externalAccountId: 'open-id',
    expiresAt: new Date(Date.now() + 86_400_000),
    refreshExpiresAt: new Date(Date.now() + 300 * 86_400_000),
  });
});

afterEach(() => {
  for (const key of ENV) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
});

describe('a creator-chosen privacy level', () => {
  it('is sent to TikTok exactly as chosen', async () => {
    mockTikTok(['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY']);

    const result = await publish({ privacyLevel: 'MUTUAL_FOLLOW_FRIENDS' });

    expect(result.ok).toBe(true);
    expect(initPayload()?.post_info?.privacy_level).toBe('MUTUAL_FOLLOW_FRIENDS');
  });

  it('THE RULE: an unavailable choice FAILS rather than being substituted', async () => {
    // The operator picked Public; the account (unaudited) can only do private.
    mockTikTok(['SELF_ONLY']);

    const result = await publish({ privacyLevel: 'PUBLIC_TO_EVERYONE' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    // Non-retriable: retrying cannot change what the account is allowed to do.
    expect(result.retriable).toBe(false);
    expect(result.error).toMatch(/PUBLIC_TO_EVERYONE/);
    // And above all: nothing was posted at any privacy level.
    expect(initPayload()).toBeUndefined();
  });

  it('still posts a PHOTO carousel, not a video', async () => {
    mockTikTok(['SELF_ONLY']);
    await publish({ privacyLevel: 'SELF_ONLY' });
    expect(initPayload()?.media_type).toBe('PHOTO');
  });
});

describe('the cron path, where nobody chose', () => {
  it('takes the most public level the account actually offers', async () => {
    mockTikTok(['PUBLIC_TO_EVERYONE', 'SELF_ONLY']);
    await publish();
    expect(initPayload()?.post_info?.privacy_level).toBe('PUBLIC_TO_EVERYONE');
  });

  it('falls back to SELF_ONLY while the app is unaudited', async () => {
    mockTikTok(['SELF_ONLY']);
    const result = await publish();
    expect(initPayload()?.post_info?.privacy_level).toBe('SELF_ONLY');
    // And says so, rather than reporting a silent success ops would misread.
    if (!result.ok) throw new Error('expected a successful publish');
    expect(result.note).toMatch(/PRIVATELY/i);
  });
});
