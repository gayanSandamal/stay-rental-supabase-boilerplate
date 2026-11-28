import type { FeatureFlags } from '@/lib/feature-flags';
import { importFollowUpReport } from './import-follow-up';
import type { ReportDefinition } from './types';

/** Every report, in display order. What to add next: docs/back-office-reports-plan.md */
export const REPORTS: ReportDefinition[] = [importFollowUpReport];

export function availableReports(flags: FeatureFlags): ReportDefinition[] {
  if (!flags.enableDataExport) return [];
  return REPORTS.filter((report) => report.isAvailable(flags));
}

export function findReport(id: string, flags: FeatureFlags): ReportDefinition | null {
  return availableReports(flags).find((report) => report.id === id) ?? null;
}
