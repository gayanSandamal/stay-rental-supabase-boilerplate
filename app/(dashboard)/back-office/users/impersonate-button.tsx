'use client';

import { useState } from 'react';
import { Eye } from 'lucide-react';

/**
 * "View as" — starts an impersonation session for one user.
 *
 * Rendered only for tenants and landlords, and only for an admin. Both rules
 * are enforced server-side in `startImpersonation`; hiding the button is a
 * courtesy so operators are not offered actions that will be refused, never the
 * control itself.
 */
export function ImpersonateButton({
  userId,
  label,
}: {
  userId: number;
  label: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    // A deliberate speed bump. This is one person assuming another person's
    // identity; it should never happen from a stray click.
    if (!window.confirm(`View the app as ${label}?\n\nThis is read-only and is recorded in the audit log.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/impersonation/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not start');
      // Full navigation, not router.push: the identity behind every cached
      // segment just changed, so the client router's cache must not survive.
      window.location.href = '/dashboard';
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={start}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        <Eye className="h-3.5 w-3.5" aria-hidden />
        {busy ? 'Starting…' : 'View as'}
      </button>
      {error && <p className="mt-1 text-[11px] text-rose-700">{error}</p>}
    </>
  );
}
