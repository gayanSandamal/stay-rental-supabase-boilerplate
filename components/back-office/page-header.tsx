import type { LucideIcon } from 'lucide-react';

/**
 * One `<h1>` per screen, with an optional summary line of counts. Kept small:
 * screen real estate in the back office is spent on rows, not on chrome.
 */
export function PageHeader({
  icon: Icon,
  title,
  summary,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  summary?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Icon className="h-6 w-6 shrink-0 text-teal-700" />
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      {summary && (
        <span className="text-sm text-slate-500 tabular-nums">{summary}</span>
      )}
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}
