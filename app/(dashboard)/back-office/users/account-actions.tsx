'use client';

import { useState } from 'react';
import { Ban, Trash2, Undo2 } from 'lucide-react';

/**
 * Ban / unban / permanently delete, for one account.
 *
 * The two destructive paths are deliberately NOT symmetrical in how hard they
 * are to trigger. A ban is reversible, so it asks for a reason and a
 * confirmation. A hard delete is not reversible by anything — no backup restore
 * short of the whole database — so it makes the operator type the account's
 * email. That is not friction for its own sake: the id under the cursor is not
 * a statement of intent when the list may have been rendered minutes ago, and
 * the server checks the typed address against the row for exactly that reason.
 */
export function AccountActions({
  userId,
  email,
  label,
  banned,
  canDelete,
  canBan,
}: {
  userId: number;
  email: string;
  label: string;
  banned: boolean;
  canDelete: boolean;
  canBan: boolean;
}) {
  const [busy, setBusy] = useState<null | 'ban' | 'unban' | 'delete'>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [typed, setTyped] = useState('');

  async function ban() {
    const reason = window.prompt(
      `Ban ${label}?\n\nAll their active and pending listings will be archived and taken off our social accounts.\n\nReason (recorded in the audit log):`
    );
    if (reason === null) return;
    if (!reason.trim()) {
      setError('A reason is required.');
      return;
    }
    setBusy('ban');
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ban', reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not ban');
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function unban() {
    setBusy('unban');
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unban' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not unban');
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function hardDelete() {
    setBusy('delete');
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmEmail: typed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not delete');
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        {canBan &&
          (banned ? (
            <button
              onClick={unban}
              disabled={busy !== null}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <Undo2 className="h-3.5 w-3.5" aria-hidden />
              {busy === 'unban' ? 'Working…' : 'Unban'}
            </button>
          ) : (
            <button
              onClick={ban}
              disabled={busy !== null}
              className="inline-flex items-center gap-1 rounded-md border border-amber-300 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-60"
            >
              <Ban className="h-3.5 w-3.5" aria-hidden />
              {busy === 'ban' ? 'Banning…' : 'Ban'}
            </button>
          ))}
        {canDelete && !confirmingDelete && (
          <button
            onClick={() => setConfirmingDelete(true)}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 rounded-md border border-rose-300 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Delete
          </button>
        )}
      </div>

      {confirmingDelete && (
        <div className="mt-1 w-64 rounded-md border border-rose-300 bg-rose-50 p-2 text-left">
          <p className="text-[11px] leading-snug text-rose-900">
            <strong>Permanent.</strong> Their listings, photos, saved searches and
            contact numbers are erased. This cannot be undone.
          </p>
          <p className="mt-1 text-[11px] text-rose-800">
            Type <code className="font-mono font-semibold">{email}</code> to confirm:
          </p>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="mt-1 w-full rounded border border-rose-300 px-1.5 py-1 text-[11px]"
            placeholder="email"
            autoComplete="off"
          />
          <div className="mt-1.5 flex gap-1">
            <button
              onClick={hardDelete}
              // The server checks this too — the button being enabled is a
              // convenience, never the guard.
              disabled={busy !== null || typed.trim().toLowerCase() !== email.toLowerCase()}
              className="rounded bg-rose-700 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
            >
              {busy === 'delete' ? 'Deleting…' : 'Delete forever'}
            </button>
            <button
              onClick={() => {
                setConfirmingDelete(false);
                setTyped('');
                setError(null);
              }}
              className="rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="max-w-56 text-right text-[11px] text-rose-700">{error}</p>}
    </div>
  );
}
