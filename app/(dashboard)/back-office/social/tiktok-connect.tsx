import Link from 'next/link';
import { CheckCircle2, Link2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CredentialHealth } from '@/lib/social/health';

/**
 * The one thing TikTok needs that Facebook Page and Instagram do not: a human
 * clicking "authorise".
 *
 * Meta's credentials ARE env vars — paste `FACEBOOK_PAGE_ACCESS_TOKEN` and the
 * platform is live. TikTok's tokens rotate (access ~24h, refresh replaced on
 * every use), so they cannot live in the environment; they are obtained once
 * through OAuth and then kept fresh in `social_accounts`. That made TikTok the
 * only platform whose setup could not be finished by a deploy — and until this
 * component existed, the OAuth route had no caller, so it could not be finished
 * at all without hand-typing the URL.
 *
 * Deliberately server-rendered with no client JS: starting OAuth is a plain
 * navigation, and `/api/social/tiktok/connect` is a GET that only mints a CSRF
 * state cookie before redirecting to TikTok. Nothing here mutates.
 */

/** Redirect URI the connect route sends; must match the developer portal exactly. */
function redirectUri(): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://easyrent.lk';
  return `${base}/api/social/tiktok/callback`;
}

export const TIKTOK_STATUS_KEY = 'tiktok';

/**
 * What each `?tiktok=` value from the callback means, phrased as what to do
 * next. The callback never puts token material in the URL — only these codes.
 */
const RESULTS: Record<string, { ok: boolean; title: string; detail: string }> = {
  connected: {
    ok: true,
    title: 'TikTok connected',
    detail:
      'Easy Rent can now post to this TikTok account. The access token is refreshed automatically from here on.',
  },
  denied: {
    ok: false,
    title: 'TikTok authorisation cancelled',
    detail: 'Nothing changed. Start again when you are ready.',
  },
  missing_code: {
    ok: false,
    title: 'TikTok did not return an authorisation code',
    detail: 'Start the connection again from this page.',
  },
  bad_state: {
    ok: false,
    title: 'Authorisation could not be verified',
    detail:
      'The security check failed — this happens if the flow was started in another browser or took longer than 10 minutes. Start it again from this page.',
  },
  exchange_failed: {
    ok: false,
    title: 'TikTok rejected the authorisation code',
    detail:
      'Check TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET, and that the redirect URI registered in the TikTok developer portal matches this app exactly.',
  },
  error: {
    ok: false,
    title: 'Could not finish connecting TikTok',
    detail: 'Something failed while exchanging the code. The server logs have the detail.',
  },
};

/**
 * The outcome of a just-completed OAuth round trip.
 *
 * Not an `AlarmBanner`: that component is explicitly for "things that are wrong
 * RIGHT NOW", and a successful connection is neither wrong nor persistent —
 * this is a one-shot result that disappears on the next navigation.
 */
export function TikTokConnectResult({ status }: { status: string }) {
  const result = RESULTS[status];
  if (!result) return null;

  const Icon = result.ok ? CheckCircle2 : XCircle;
  return (
    <section
      role="status"
      className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
        result.ok
          ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
          : 'border-rose-300 bg-rose-50 text-rose-900'
      }`}
    >
      <h2 className="flex items-center gap-2 font-semibold">
        <Icon className="h-4 w-4 shrink-0" />
        {result.title}
      </h2>
      <p className="mt-1 opacity-90">{result.detail}</p>
    </section>
  );
}

/**
 * The connect control, rendered under TikTok's status line.
 *
 * Three states, because the operator's next action differs in each:
 *  · no app keys      → nothing to click; the fix is a deploy, not a click
 *  · keys, no account → Connect
 *  · connected        → Reconnect (for a lapsed grant, or a different account)
 */
export function TikTokConnectRow({
  health,
  publishEnabled,
}: {
  health: CredentialHealth;
  /** Whether posts would actually go out if an account were linked. */
  publishEnabled: boolean;
}) {
  if (!health.configured) {
    return (
      <p className="mt-1 text-xs text-slate-500">
        Set <code className="rounded bg-slate-100 px-1">TIKTOK_CLIENT_KEY</code> and{' '}
        <code className="rounded bg-slate-100 px-1">TIKTOK_CLIENT_SECRET</code> before an account
        can be linked.
      </p>
    );
  }

  const connected = health.valid === true;
  /*
   * A LAPSED grant is still a linked account — health names the very account it
   * lapsed for — so the action there is a re-connect, and the button has to
   * agree with the status line telling the operator to "reconnect TikTok".
   * Only a platform with no account at all is a first connect.
   */
  const linked = connected || Boolean(health.accountName);

  return (
    <div className="mt-1.5 space-y-1.5">
      {/* The visible payoff of the `user.info.basic` scope: ops can SEE which
          account is linked, not just read a name. The URL is cached and TikTok
          signs these, so it is allowed to 404 — hence the initials fallback
          rather than a bare <img> that would render as a broken icon. */}
      {linked && (
        <span className="flex items-center gap-2 text-xs text-slate-600">
          {health.accountAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={health.accountAvatarUrl}
              alt=""
              className="h-6 w-6 rounded-full border border-slate-200 object-cover"
            />
          ) : (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600">
              {(health.accountName ?? 'TT').slice(0, 2).toUpperCase()}
            </span>
          )}
          <span>
            Posting as <strong className="text-slate-800">{health.accountName ?? 'the linked account'}</strong>
          </span>
        </span>
      )}

      {/* A broken connection needs the emphasis; a healthy one must not shout. */}
      <Button asChild size="sm" variant={connected ? 'outline' : 'default'}>
        <Link href="/api/social/tiktok/connect" prefetch={false}>
          <Link2 className="mr-1.5 h-4 w-4" />
          {linked ? 'Reconnect TikTok' : 'Connect TikTok'}
        </Link>
      </Button>

      {connected && publishEnabled && (
        /*
         * The audit gate is not ours and cannot be checked from here, so it is
         * stated rather than detected. An unaudited client is forced to
         * SELF_ONLY, and a private post looks identical to a successful one in
         * every row of this page — the adapter's `note` is the only place the
         * truth appears once it has happened.
         */
        <p className="text-xs text-slate-500">
          Until TikTok has audited the app, posts are forced to{' '}
          <strong>SELF_ONLY (private)</strong> and capped at 5 creators per 24h.
        </p>
      )}

      {connected && !publishEnabled && (
        <p className="text-xs text-slate-500">
          Connected, but <strong>“post to TikTok” is switched off</strong> — nothing will be sent
          until it is enabled in Settings.
        </p>
      )}

      <p className="text-xs text-slate-400">
        Redirect URI to register in the TikTok developer portal:{' '}
        <code className="rounded bg-slate-100 px-1 text-slate-600">{redirectUri()}</code>
      </p>
    </div>
  );
}
