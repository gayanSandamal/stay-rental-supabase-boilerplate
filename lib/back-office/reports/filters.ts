import { colomboDayStart } from './csv';
import type { ReportDefinition, ReportFilters } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RawReportParams {
  view?: string | null;
  from?: string | null;
  to?: string | null;
}

/** Clamp hand-edited URLs to something valid. `to` is inclusive for the reader. */
export function parseReportFilters(
  report: Pick<ReportDefinition, 'views'>,
  raw: RawReportParams
): ReportFilters {
  const view = report.views.find((v) => v.key === raw.view)?.key ?? report.views[0].key;
  const from = colomboDayStart(raw.from);
  const toDay = colomboDayStart(raw.to);
  return { view, from, to: toDay ? new Date(toDay.getTime() + DAY_MS) : null };
}
