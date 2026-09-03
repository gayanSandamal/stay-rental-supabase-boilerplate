'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EyeOff } from 'lucide-react';

/**
 * The banner that makes it impossible to forget you are someone else.
 *
 * Deliberately loud, fixed to the top of the viewport, and present on every
 * page. The failure mode this prevents is an operator wandering off in an
 * impersonated session and later reading it as their own account — which is how
 * someone concludes the product is broken for them, or worse, mistakes another
 * person's data for their own.
 *
 * It also carries the only exit. While impersonating a tenant or landlord the
 * admin has no back-office access (they are, as far as every role check is
 * concerned, that user), so the way out cannot live behind an admin-only route.
 */
export function ImpersonationBanner({
  subjectLabel,
  actorLabel,
  expiresAt,
}: {
  subjectLabel: string;
  actorLabel: string;
  expiresAt: string | null;
}) {
  const router = useRouter();
  const [exiting, setExiting] = useState(false);
  const [remaining, setRemaining] = useState<string | null>(null);

  // A visible countdown, because the session ends on its own and a silent
  // expiry mid-task is disorienting.
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (ms <= 0) {
        setRemaining('expired');
        router.refresh();
        return;
      }
      const mins = Math.floor(ms / 60000);
      const secs = Math.floor((ms % 60000) / 1000);
      setRemaining(`${mins}:${String(secs).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, router]);

  async function exit() {
    setExiting(true);
    try {
      await fetch('/api/impersonation/exit', { method: 'POST' });
      // Full reload, not router.refresh(): the identity behind every cached
      // segment has just changed, and a soft refresh can leave the subject's
      // rendered data on screen under the admin's restored session.
      window.location.href = '/back-office/users';
    } catch {
      setExiting(false);
    }
  }

  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950"
    >
      <EyeOff className="h-4 w-4 shrink-0" aria-hidden />
      <span>
        Viewing as <strong>{subjectLabel}</strong> — read-only. You are signed in as{' '}
        {actorLabel}.
      </span>
      {remaining && (
        <span className="tabular-nums opacity-80">ends in {remaining}</span>
      )}
      <button
        onClick={exit}
        disabled={exiting}
        className="rounded-md bg-amber-950 px-3 py-1 text-xs font-semibold text-amber-50 hover:bg-amber-900 disabled:opacity-60"
      >
        {exiting ? 'Exiting…' : 'Exit impersonation'}
      </button>
    </div>
  );
}
