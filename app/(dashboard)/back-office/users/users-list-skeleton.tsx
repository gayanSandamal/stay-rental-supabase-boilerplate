/** Matches the real table's shape so nothing shifts when the rows arrive. */
export function UsersListSkeleton() {
  return (
    <div className="-mx-1 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-7 w-24 animate-pulse rounded-md bg-slate-100" />
        ))}
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <div className="h-5 flex-1 animate-pulse rounded bg-slate-100" />
            <div className="h-5 w-20 animate-pulse rounded bg-slate-100" />
            <div className="h-5 w-24 animate-pulse rounded bg-slate-100" />
            <div className="h-5 w-16 animate-pulse rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
