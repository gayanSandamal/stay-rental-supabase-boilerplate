'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Fixed action bar, present only while a selection exists.
 *
 * Bulk actions are the real throughput lever on these queues: 200 held
 * listings worked one row at a time is the scaling wall, not render
 * performance.
 */
export function BulkActionBar({
  count,
  totalMatching,
  onClear,
  pending,
  children,
}: {
  count: number;
  /** The full filtered total, so "select all" can be honest about its scope. */
  totalMatching?: number;
  onClear: () => void;
  pending?: boolean;
  children: React.ReactNode;
}) {
  if (count === 0) return null;

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="fixed inset-x-0 bottom-0 z-40 flex flex-wrap items-center gap-3 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-2px_8px_rgba(15,23,42,0.08)]"
    >
      <span className="text-sm font-semibold text-slate-900 tabular-nums" aria-live="polite">
        {count.toLocaleString()} selected
        {typeof totalMatching === 'number' && totalMatching > count && (
          <span className="ml-1 font-normal text-slate-500">
            of {totalMatching.toLocaleString()} matching
          </span>
        )}
      </span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClear}
        disabled={pending}
        className="ml-auto"
      >
        <X className="h-4 w-4" />
        Clear
      </Button>
    </div>
  );
}
