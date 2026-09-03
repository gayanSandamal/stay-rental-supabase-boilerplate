/**
 * Instant paint for the ops surfaces. These are the heaviest pages in the app
 * (one carries `maxDuration = 60`), so they are the ones where a blank screen
 * lasted longest.
 */
export default function Loading() {
  return (
    <div className="p-6 space-y-6">
      <div className="h-8 w-64 bg-gray-200 rounded animate-pulse" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 w-24 bg-gray-200 rounded-lg animate-pulse" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-16 bg-white rounded-lg border border-gray-200 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
