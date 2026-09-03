/**
 * Instant paint for every /dashboard segment that does not define its own.
 * See app/(dashboard)/listings/loading.tsx for why this file exists at all.
 */
export default function Loading() {
  return (
    <div className="p-6 space-y-6">
      <div className="h-8 w-52 bg-gray-200 rounded animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-white rounded-xl border border-gray-200 animate-pulse" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 bg-white rounded-xl border border-gray-200 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
