import Link from 'next/link';
import { listHref, type ListParams } from '@/lib/back-office/list-params';

/**
 * "Nothing here" and "nothing matches" are different facts and must read
 * differently. A filtered view that borrows the reassuring empty-queue copy is
 * a silent lie — the operator concludes there is no work when there is.
 */
export function EmptyState({
  basePath,
  params,
  emptyMessage,
  filterLabel,
}: {
  basePath: string;
  params: ListParams;
  /** Shown when there is genuinely nothing in this queue. */
  emptyMessage: string;
  /** Human name of the active tab, for the filtered message. */
  filterLabel?: string;
}) {
  const isFiltered = Boolean(params.q) || Boolean(filterLabel);

  if (!isFiltered) {
    return (
      <div className="px-4 py-12 text-center text-sm text-slate-500">
        {emptyMessage}
      </div>
    );
  }

  const bits = [
    filterLabel ? <code key="t" className="font-mono text-slate-700">{filterLabel}</code> : null,
    params.q ? <code key="q" className="font-mono text-slate-700">{params.q}</code> : null,
  ].filter(Boolean);

  return (
    <div className="px-4 py-12 text-center text-sm text-slate-500">
      <p>
        Nothing matches{' '}
        {bits.map((bit, i) => (
          <span key={i}>
            {i > 0 ? ' + ' : ''}
            {bit}
          </span>
        ))}
        .
      </p>
      <Link
        href={listHref(basePath, params, { tab: 'all', q: '' })}
        className="mt-2 inline-block font-medium text-teal-700 hover:underline"
      >
        Clear filters
      </Link>
    </div>
  );
}
