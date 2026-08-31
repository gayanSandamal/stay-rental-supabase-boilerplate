import Link from 'next/link';
import { cn } from '@/lib/utils';
import { listHref, type ListParams } from '@/lib/back-office/list-params';

export type TabDef = {
  /** URL value, and the lifecycle key the count is looked up by. */
  key: string;
  label: string;
  count: number;
  /** Draws the eye when non-zero — used for the "needs a human" tabs. */
  urgent?: boolean;
};

/**
 * Status tabs with live counts.
 *
 * The count is the primary signal that work exists, so a zero-count tab renders
 * DIMMED rather than hidden — a tab that disappears at zero teaches operators
 * to stop looking for it, and that is how a queue gets abandoned.
 */
export function CountTabs({
  basePath,
  params,
  tabs,
}: {
  basePath: string;
  params: ListParams;
  tabs: TabDef[];
}) {
  return (
    <nav aria-label="Filter by status" className="flex flex-wrap items-center gap-1">
      {tabs.map((tab) => {
        const active = tab.key === params.tab;
        return (
          <Link
            key={tab.key}
            href={listHref(basePath, params, { tab: tab.key })}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1',
              active
                ? 'bg-teal-50 font-semibold text-teal-900'
                : tab.count === 0
                  ? 'text-slate-400 hover:bg-slate-50'
                  : 'text-slate-600 hover:bg-slate-50'
            )}
          >
            {tab.label}
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                active
                  ? 'bg-teal-700 text-white'
                  : tab.urgent && tab.count > 0
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-slate-100 text-slate-600'
              )}
            >
              {tab.count.toLocaleString()}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
