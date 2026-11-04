import { Suspense } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Plug, Unplug } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getUser } from '@/lib/db/queries';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { listGrantsForUser } from '@/lib/mcp/oauth/store';
import { originFromHeaders, redirectDisplayHost, resourceFor } from '@/lib/mcp/oauth/config';
import { CopyField } from './copy-field';
import { revokeConnectedApp } from './actions';

export const metadata = { title: 'Connected apps' };

/**
 * Connected apps — the MCP connector's user-facing half: how to connect Claude,
 * and every connection this account has granted, with a Disconnect button.
 * Static chrome here, everything user-dependent below Suspense (PPR pattern,
 * see app/(dashboard)/listings/listings-results.tsx).
 */
export default function ConnectedAppsPage() {
  return (
    <section className="flex-1 p-4 lg:p-8">
      <h1 className="mb-2 text-lg font-medium text-gray-900 lg:text-2xl">Connected apps</h1>
      <p className="mb-6 max-w-2xl text-sm text-gray-600">
        Connect Claude (or any app that supports MCP) to your Easy Rent account to search rentals, manage your
        listings and check how they are doing — just by asking.
      </p>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-gray-100" />}>
        <ConnectedAppsBody />
      </Suspense>
    </section>
  );
}

async function ConnectedAppsBody() {
  const user = await getUser();
  if (!user) redirect('/sign-in?redirect=/dashboard/connected-apps');
  await loadFeatureFlags();
  const enabled = isFeatureEnabled('enableMcpConnector');
  const origin = originFromHeaders(await headers());
  const grants = await listGrantsForUser(user.id);

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5 text-teal-700" /> Connect Claude
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-gray-700">
          {!enabled && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
              Connecting new apps is switched off at the moment. Existing connections are kept.
            </p>
          )}
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              In Claude, open <strong>Settings → Connectors</strong> and choose <strong>Add custom connector</strong>.
            </li>
            <li>
              Name it <strong>Easy Rent</strong> and paste this URL:
              <CopyField value={resourceFor(origin)} />
            </li>
            <li>
              Click <strong>Connect</strong>, sign in to Easy Rent if asked, and approve. You choose what it may do.
            </li>
          </ol>
          <p className="text-xs text-gray-500">
            Then try: “Find me a 2-bedroom house in Nugegoda under LKR 80,000 with a generator” or “How are my listings
            doing this week?”
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your connections</CardTitle>
        </CardHeader>
        <CardContent>
          {grants.length === 0 ? (
            <p className="text-sm text-gray-600">No apps are connected to your account.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {grants.map((g) => {
                const firstRedirect = safeFirst(g.redirectUris);
                return (
                  <li key={g.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">
                        {g.clientName || 'Unnamed app'}
                        {firstRedirect && (
                          <span className="ml-2 text-xs font-normal text-gray-500">via {redirectDisplayHost(firstRedirect)}</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        Can: {g.scope.split(' ').map(scopeLabel).join(', ')} · Connected {fmt(g.createdAt)}
                        {g.lastUsedAt ? ` · Last used ${fmt(g.lastUsedAt)}` : ''}
                      </p>
                    </div>
                    <form action={revokeConnectedApp}>
                      <input type="hidden" name="grantId" value={g.id} />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50"
                      >
                        <Unplug className="h-4 w-4" /> Disconnect
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function scopeLabel(s: string): string {
  return s === 'read' ? 'read' : s === 'write' ? 'make changes' : s === 'admin' ? 'back office' : s;
}

function fmt(d: Date): string {
  return d.toLocaleDateString('en-LK', { year: 'numeric', month: 'short', day: 'numeric' });
}

function safeFirst(json: string): string | null {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) && typeof arr[0] === 'string' ? arr[0] : null;
  } catch {
    return null;
  }
}
