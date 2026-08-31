import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  listHref,
  pageCount,
  rangeLabel,
  type ListParams,
} from '@/lib/back-office/list-params';

/**
 * Offset pagination with an honest total.
 *
 * The range label is the contract: "1–50 of 1,284" proves the list was paged
 * rather than silently truncated, which is the failure these screens had — a
 * hard LIMIT with no pager loses work at row N+1 and never says so.
 */
export function Pager({
  basePath,
  params,
  total,
}: {
  basePath: string;
  params: ListParams;
  total: number;
}) {
  const pages = pageCount(params, total);
  const hasPrev = params.page > 1;
  const hasNext = params.page < pages;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-3 py-2">
      <p className="text-xs text-slate-500 tabular-nums" aria-live="polite">
        {rangeLabel(params, total)}
      </p>
      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-1">
          <PagerLink
            href={listHref(basePath, params, { page: params.page - 1 })}
            disabled={!hasPrev}
            label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </PagerLink>
          <span className="px-2 text-xs text-slate-500 tabular-nums">
            {params.page} / {pages}
          </span>
          <PagerLink
            href={listHref(basePath, params, { page: params.page + 1 })}
            disabled={!hasNext}
            label="Next page"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </PagerLink>
        </nav>
      )}
    </div>
  );
}

function PagerLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const classes =
    'inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium';

  if (disabled) {
    return (
      <span aria-disabled className={cn(classes, 'cursor-not-allowed text-slate-300')}>
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(classes, 'text-slate-700 hover:bg-slate-50')}
    >
      {children}
    </Link>
  );
}
