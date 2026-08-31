import { CountTabs, type TabDef } from './count-tabs';
import { SearchInput } from './search-input';
import type { ListParams } from '@/lib/back-office/list-params';

/**
 * The sticky filter bar: status tabs on the left, search on the right.
 *
 * Sticky so that on a long page the operator can always re-narrow without
 * scrolling back up, which is most of what makes a thousand-row queue workable.
 */
export function FilterBar({
  basePath,
  params,
  tabs,
  searchPlaceholder,
  children,
}: {
  basePath: string;
  params: ListParams;
  tabs: TabDef[];
  searchPlaceholder: string;
  /** Extra filters (city, business account…) rendered beside the search box. */
  children?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-20 -mx-1 mb-0 flex flex-wrap items-center gap-2 rounded-t-lg border border-b-0 border-slate-200 bg-white px-3 py-2">
      <CountTabs basePath={basePath} params={params} tabs={tabs} />
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {children}
        <SearchInput
          basePath={basePath}
          params={params}
          placeholder={searchPlaceholder}
        />
      </div>
    </div>
  );
}
