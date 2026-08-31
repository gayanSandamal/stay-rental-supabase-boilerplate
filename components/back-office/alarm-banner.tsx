import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The alarm zone: things that are wrong RIGHT NOW.
 *
 * Rendered above the filter bar, only when non-empty, and never paginated or
 * collapsed. An operator must not have to page forward to discover a live
 * problem.
 *
 * One banner per DISTINCT failure. Merging two failures into one summary is
 * what loses the signal — "never checked" and "stuck in queue" are different
 * bugs with different fixes.
 */
export function AlarmBanner({
  tone = 'alarm',
  title,
  children,
  icon: Icon = AlertTriangle,
}: {
  tone?: 'alarm' | 'caution';
  title: React.ReactNode;
  children?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <section
      role="alert"
      className={cn(
        'mb-4 rounded-lg border px-4 py-3',
        tone === 'alarm'
          ? 'border-rose-300 bg-rose-50 text-rose-900'
          : 'border-amber-300 bg-amber-50 text-amber-900'
      )}
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 shrink-0" />
        {title}
      </h2>
      {children && <div className="mt-2 text-sm">{children}</div>}
    </section>
  );
}
