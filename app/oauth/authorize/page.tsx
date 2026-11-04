import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { ShieldCheck, ShieldAlert, ArrowLeftRight, Plug } from 'lucide-react';
import { getUser } from '@/lib/db/queries';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { isReservedWaEmail } from '@/lib/intake/landlord-identity';
import {
  AUTHORIZE_PARAM_KEYS,
  buildClientRedirect,
  pickAuthorizeParams,
  validateAuthorizeRequest,
} from '@/lib/mcp/oauth/authorize';
import {
  SCOPE_DESCRIPTIONS,
  canHoldAdminScope,
  grantableScopes,
  originFromHeaders,
  redirectDisplayHost,
  type Scope,
} from '@/lib/mcp/oauth/config';

export const metadata = {
  title: 'Connect an app',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * OAuth consent screen for the Easy Rent MCP connector.
 *
 * GET only renders. The decision is a classic form POST to
 * /api/oauth/authorize, which re-validates every field and answers with a 303 —
 * a plain redirect works for every redirect scheme (https, loopback, cursor://)
 * where a server-action redirect would depend on the client router.
 */
export default async function AuthorizePage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const first = (k: string) => {
    const v = raw[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const params = pickAuthorizeParams(first);

  await loadFeatureFlags();
  if (!isFeatureEnabled('enableMcpConnector')) {
    return <ErrorCard message="Connecting apps to Easy Rent is not available right now. Please try again later." />;
  }

  const origin = originFromHeaders(await headers());
  const result = await validateAuthorizeRequest(params, origin);

  if (result.kind === 'show_error') return <ErrorCard message={result.message} />;
  if (result.kind === 'redirect_error') {
    redirect(
      buildClientRedirect(result.redirectUri, {
        error: result.error,
        error_description: result.description,
        state: result.state,
        iss: origin,
      })
    );
  }

  const user = await getUser();
  if (!user) {
    const qs = new URLSearchParams();
    for (const k of AUTHORIZE_PARAM_KEYS) if (params[k]) qs.set(k, params[k]!);
    redirect(`/sign-in?redirect=${encodeURIComponent(`/oauth/authorize?${qs.toString()}`)}`);
  }

  if (user.impersonatedBy) {
    return (
      <ErrorCard message="You are viewing Easy Rent as another user. Exit impersonation before connecting an app — a connection made now would act as them, not you." />
    );
  }

  const offered = grantableScopes(result.requestedScopes, user.role);
  const host = redirectDisplayHost(result.redirectUri);
  const appName = result.client.clientName || 'An app';
  const identity =
    user.name?.trim() ||
    (!isReservedWaEmail(user.email) ? user.email : null) ||
    user.waPhone ||
    'your account';
  const roleLabel: Record<string, string> = {
    tenant: 'renter',
    landlord: 'landlord',
    ops: 'Easy Rent operations',
    admin: 'Easy Rent admin',
  };

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-lg flex-col justify-center px-4 py-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-200">
            <Plug className="h-6 w-6" />
          </div>
          <ArrowLeftRight className="h-4 w-4 text-slate-400" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/easy-rent-logo.png" alt="Easy Rent" className="h-10 w-auto" />
        </div>

        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
          {appName} wants to connect to your Easy Rent account
        </h1>

        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          After you approve, you will be sent back to <strong className="font-semibold">{host}</strong>. Only continue
          if you started connecting from there — the app name above is chosen by the app itself.
        </div>

        <p className="mt-5 text-sm text-slate-600">
          Signed in as <strong className="text-slate-900">{identity}</strong> ({roleLabel[user.role] ?? user.role}).{' '}
          <Link
            href={`/sign-in?redirect=${encodeURIComponent(
              `/oauth/authorize?${new URLSearchParams(params as Record<string, string>).toString()}`
            )}`}
            className="font-medium text-teal-700 hover:underline"
          >
            Not you?
          </Link>
        </p>

        <form method="POST" action="/api/oauth/authorize" className="mt-6 space-y-5">
          {AUTHORIZE_PARAM_KEYS.map((k) =>
            params[k] ? <input key={k} type="hidden" name={k} value={params[k]} /> : null
          )}

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-slate-900">It will be able to:</legend>
            <div className="space-y-2">
              {offered.map((scope) => (
                <ScopeRow key={scope} scope={scope} />
              ))}
            </div>
          </fieldset>

          <ul className="space-y-1.5 text-xs text-slate-500">
            <li className="flex gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
              It acts as you, with exactly your permissions. It never sees your password.
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
              New and edited listings still go through review before they are public.
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
              Disconnect any time in Dashboard → Connected apps.
            </li>
          </ul>

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button
              type="submit"
              name="decision"
              value="deny"
              className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              name="decision"
              value="approve"
              className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
            >
              Approve and connect
            </button>
          </div>
        </form>
      </div>
    </main>
  );

  function ScopeRow({ scope }: { scope: Scope }) {
    // read is what makes a connection a connection; the rest are optional.
    const locked = scope === 'read';
    // admin is never pre-ticked: an operator connecting Claude for renter-style
    // searches should not hand it the back office by accepting a default.
    const defaultChecked = scope !== 'admin';
    return (
      <label
        className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
          scope === 'admin' ? 'border-rose-200 bg-rose-50/50' : 'border-slate-200'
        }`}
      >
        <input
          type="checkbox"
          name="grant_scope"
          value={scope}
          defaultChecked={defaultChecked}
          disabled={locked}
          className="mt-0.5 h-4 w-4 accent-teal-700"
        />
        {locked && <input type="hidden" name="grant_scope" value="read" />}
        <span>
          <span className="block font-medium text-slate-900">
            {scope === 'read' ? 'Read' : scope === 'write' ? 'Make changes' : 'Back office'}
            {scope === 'admin' && canHoldAdminScope(user!.role) && (
              <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-700">
                staff only
              </span>
            )}
          </span>
          <span className="text-slate-600">{SCOPE_DESCRIPTIONS[scope]}</span>
        </span>
      </label>
    );
  }
}

function ErrorCard({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-200">
        <ShieldAlert className="h-7 w-7" />
      </div>
      <h1 className="text-2xl font-bold text-slate-900">Can’t connect this app</h1>
      <p className="mt-3 text-slate-600">{message}</p>
      <Link href="/" className="mt-8 font-medium text-teal-700 hover:underline">
        Go to Easy Rent
      </Link>
    </main>
  );
}
