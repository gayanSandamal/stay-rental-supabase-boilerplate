/**
 * Are the social credentials actually alive?
 *
 * `isFacebookPageConfigured()` and friends answer "is the env var set?", which
 * is not the same question and cannot catch the two faults this integration has
 * actually hit in production:
 *
 *   · 2026-08-22 — FACEBOOK_PAGE_ID held the App ID. Every publish failed with
 *     "Object with ID '…' does not exist".
 *   · 2026-08-22 — the deployed Page token was one minted from a SHORT-LIVED
 *     user token, so it died 19 hours later. A short-lived-derived Page token is
 *     indistinguishable from a permanent one by inspection; only its expiry
 *     tells them apart.
 *
 * Through both, Back Office → Social displayed Facebook as "live". This module
 * is what lets that panel tell the truth, and it is surfaced on the publish
 * cron's JSON for the same reason `probeImageToolchain()` is surfaced on the
 * moderation cron's.
 *
 * It NEVER returns, logs or renders a token — only booleans, timestamps and
 * account names.
 */

import {
  isFacebookPageConfigured,
  isInstagramConfigured,
  isTikTokConfigured,
  socialConfig,
} from './config';
import { graphGet, isPermissionError, isTokenError, type GraphError } from './adapters/graph';
import type { SocialPlatform } from './types';

export interface CredentialHealth {
  platform: SocialPlatform;
  /** The env vars exist. Says nothing about whether they work. */
  configured: boolean;
  /**
   * The credential works right now. `undefined` means we could not tell —
   * unconfigured, manual-only, or the check itself failed. Never guess `true`.
   */
  valid?: boolean;
  /**
   * `null` = never expires (what a Page token from a long-lived user token
   * looks like, and what production should have). `undefined` = undeterminable.
   */
  expiresAt?: Date | null;
  /** The account's own name, so ops can see we are pointed at the right one. */
  accountName?: string;
  /** Why it is not valid, phrased as the thing to go and fix. */
  error?: string;
  /** No API exists for this platform, so there is no credential to check. */
  manual?: boolean;
}

export type SocialCredentialHealth = Record<SocialPlatform, CredentialHealth>;

/** Ops-only page, but a refresh should not re-hit Graph. Same shape as feature flags. */
const CACHE_TTL_MS = 60_000;
let cachedAt = 0;
let cached: SocialCredentialHealth | null = null;

/**
 * Graph reports a wrong ID as "does not exist" rather than as a distinct code,
 * so the message has to be read. Worth it: an App ID pasted into
 * FACEBOOK_PAGE_ID is the mistake this catches.
 */
function isUnknownObject(error: GraphError): boolean {
  return (
    error.code === 803 ||
    (error.code === 100 && /does not exist|Unsupported get request/i.test(error.message))
  );
}

/** Turn a Graph fault into the operator action that resolves it. */
function describeFault(error: GraphError, idVar: string): string {
  if (isTokenError(error)) {
    return `token expired or revoked (Graph ${error.code}) — regenerate a non-expiring Page token`;
  }
  if (isUnknownObject(error)) {
    return `ID does not resolve — check ${idVar} (an App ID will not work here)`;
  }
  if (isPermissionError(error)) {
    return `missing permission (Graph ${error.code}) — check the app's App Review status`;
  }
  return error.message;
}

/**
 * The Page token's expiry, when we can read it.
 *
 * `debug_token` wants an app or app-developer token. With FACEBOOK_APP_ID and
 * FACEBOOK_APP_SECRET set we build a proper app token; without them we ask with
 * the Page token itself, which Meta accepts in some app configurations and
 * refuses in others. A refusal is NOT a fault — it means the expiry is unknown,
 * which is `undefined`, not "expired".
 */
async function pageTokenExpiry(): Promise<Date | null | undefined> {
  const token = socialConfig.facebookPageAccessToken;
  const appToken =
    socialConfig.facebookAppId && socialConfig.facebookAppSecret
      ? `${socialConfig.facebookAppId}|${socialConfig.facebookAppSecret}`
      : token;

  const res = await graphGet<{ data?: { expires_at?: number; is_valid?: boolean } }>(
    'debug_token',
    { input_token: token },
    appToken
  );
  if (!res.ok) return undefined;

  const expiresAt = res.data.data?.expires_at;
  if (typeof expiresAt !== 'number') return undefined;
  // 0 is Meta's "this token does not expire" — the shape production wants.
  return expiresAt === 0 ? null : new Date(expiresAt * 1000);
}

async function checkFacebookPage(): Promise<CredentialHealth> {
  if (!isFacebookPageConfigured()) {
    return { platform: 'facebook_page', configured: false };
  }

  // One call validates BOTH env vars: the token must work AND the id must
  // resolve to a Page this token can act on.
  const res = await graphGet<{ id: string; name?: string }>(socialConfig.facebookPageId, {
    fields: 'id,name',
  });
  if (!res.ok) {
    return {
      platform: 'facebook_page',
      configured: true,
      valid: false,
      error: describeFault(res.error, 'FACEBOOK_PAGE_ID'),
    };
  }

  return {
    platform: 'facebook_page',
    configured: true,
    valid: true,
    accountName: res.data.name,
    expiresAt: await pageTokenExpiry(),
  };
}

async function checkInstagram(): Promise<CredentialHealth> {
  if (!isInstagramConfigured()) {
    return { platform: 'instagram', configured: false };
  }

  // Instagram publishes through the Page token, so its expiry is the Page
  // token's and is not repeated here. What this proves is the separate thing:
  // that the IG account id is right and reachable through that Page.
  const res = await graphGet<{ id: string; username?: string }>(
    socialConfig.instagramAccountId,
    { fields: 'id,username' }
  );
  if (!res.ok) {
    return {
      platform: 'instagram',
      configured: true,
      valid: false,
      error: describeFault(res.error, 'INSTAGRAM_BUSINESS_ACCOUNT_ID'),
    };
  }

  return {
    platform: 'instagram',
    configured: true,
    valid: true,
    accountName: res.data.username ? `@${res.data.username}` : undefined,
  };
}

async function checkTikTok(): Promise<CredentialHealth> {
  if (!isTikTokConfigured()) {
    return { platform: 'tiktok', configured: false };
  }

  // Imported lazily: the TikTok adapter reads `social_accounts` at module scope,
  // and this module must stay importable — and unit-testable — without a DB.
  const { isTikTokConnected } = await import('./adapters/tiktok');
  const connected = await isTikTokConnected();

  // No live call: TikTok's access token rotates and the adapter refreshes it on
  // use, so "is it connected" is the only question ops can act on.
  return {
    platform: 'tiktok',
    configured: true,
    valid: connected,
    error: connected ? undefined : 'app keys set but no account linked — connect TikTok',
  };
}

/** Run one check, degrading to "unknown" rather than throwing into the page. */
async function safely(
  platform: SocialPlatform,
  check: () => Promise<CredentialHealth>
): Promise<CredentialHealth> {
  try {
    return await check();
  } catch (err) {
    console.error(`[social] credential check failed for ${platform}`, err);
    // `valid` stays undefined — an unreachable Graph is not proof of a bad
    // credential, and reporting one would send ops to rotate a working token.
    return {
      platform,
      configured: true,
      error: err instanceof Error ? err.message : 'Check failed',
    };
  }
}

/**
 * Health for every platform. Cached per instance for `CACHE_TTL_MS`.
 *
 * Never throws: the caller is a page render and a cron response, and a health
 * readout that can take either of those down is worse than no readout.
 */
export async function checkSocialCredentials(force = false): Promise<SocialCredentialHealth> {
  if (!force && cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;

  const [facebookPage, instagram, tiktok] = await Promise.all([
    safely('facebook_page', checkFacebookPage),
    safely('instagram', checkInstagram),
    safely('tiktok', checkTikTok),
  ]);

  cached = {
    facebook_page: facebookPage,
    instagram,
    tiktok,
    // Meta removed the Groups API in April 2024. There is no credential.
    facebook_group: { platform: 'facebook_group', configured: true, manual: true },
  };
  cachedAt = Date.now();
  return cached;
}

/** Warn this far ahead of a token expiry — enough notice to act on a weekday. */
export const EXPIRY_WARN_MS = 7 * 24 * 60 * 60 * 1000;

export interface PlatformStatusLine {
  /** ok = working · warn = needs attention · bad = broken now · off = disabled */
  tone: 'ok' | 'warn' | 'bad' | 'off';
  text: string;
}

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/**
 * The one line ops reads to answer "is anything broken?".
 *
 * Pure and `now`-injectable so the states that matter are testable without a
 * live Graph — above all the one that caused this: a configured platform whose
 * token is dead must NEVER render as "live".
 *
 * `valid` is three-state on purpose. `undefined` means undeterminable and gets
 * its own wording; collapsing it into either healthy or broken is what makes a
 * status panel untrustworthy.
 */
export function platformStatusLine(
  health: CredentialHealth,
  enabled: boolean,
  now = Date.now()
): PlatformStatusLine {
  if (!enabled) return { tone: 'off', text: '— switched off' };
  if (health.manual) return { tone: 'ok', text: '— manual (no API exists)' };
  if (!health.configured) {
    return { tone: 'warn', text: '— not configured, posts are DRY RUNS' };
  }
  if (health.valid === false) {
    return { tone: 'bad', text: `— ✗ ${health.error ?? 'credential rejected'}` };
  }
  if (health.valid === undefined) {
    return {
      tone: 'warn',
      text: `— configured, unverified${health.error ? ` (${health.error})` : ''}`,
    };
  }

  const detail: string[] = [];
  if (health.accountName) detail.push(health.accountName);

  if (health.expiresAt) {
    const remaining = health.expiresAt.getTime() - now;
    if (remaining <= 0) {
      return {
        tone: 'bad',
        text: `— ✗ token expired ${formatDuration(-remaining)} ago — regenerate a non-expiring Page token`,
      };
    }
    if (remaining < EXPIRY_WARN_MS) {
      // The exact fault that bit us: a Page token minted from a SHORT-LIVED user
      // token is indistinguishable from a permanent one until it dies.
      return {
        tone: 'warn',
        text: `— ⚠ token expires in ${formatDuration(remaining)} — regenerate a non-expiring Page token`,
      };
    }
    detail.push(`token expires in ${formatDuration(remaining)}`);
  } else if (health.expiresAt === null) {
    detail.push('token never expires');
  }

  return { tone: 'ok', text: `— live${detail.length ? ` · ${detail.join(' · ')}` : ''}` };
}

/** Compact, JSON-safe shape for the cron response. */
export function summariseCredentialHealth(health: SocialCredentialHealth) {
  return Object.fromEntries(
    Object.entries(health).map(([platform, h]) => [
      platform,
      {
        configured: h.configured,
        valid: h.valid,
        // ISO string, `null` for never, omitted when undeterminable.
        expiresAt: h.expiresAt === null ? 'never' : h.expiresAt?.toISOString(),
        accountName: h.accountName,
        error: h.error,
      },
    ])
  );
}
