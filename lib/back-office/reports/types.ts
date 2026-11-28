/**
 * A back-office report: rows an operator can read on screen or download.
 *
 * To add one, write a definition and list it in ./index.ts. The Reports screen,
 * the detail page, the CSV route, the file name and the audit entry all come
 * from that; none of them knows any report by name.
 */
import type { FeatureFlags } from '@/lib/feature-flags';

export type Cell = string | number | null;

export interface ReportColumn {
  key: string;
  label: string;
  /** Rendered as a link on screen; the CSV gets the bare URL either way. */
  link?: boolean;
  /** Prose: wraps in a wide column. Everything else stays on one line. */
  wide?: boolean;
  /** Left out of the on-screen table, always in the CSV. */
  csvOnly?: boolean;
}

export type ReportRow = Record<string, Cell>;

export interface ReportFilters {
  /** One of the report's `views`. */
  view: string;
  /** Inclusive start / exclusive end, already resolved to instants. */
  from: Date | null;
  to: Date | null;
}

export interface ReportDefinition {
  /** URL slug and file name prefix. */
  id: string;
  title: string;
  description: string;
  group: string;
  columns: ReportColumn[];
  /** First one is the default. */
  views: { key: string; label: string }[];
  /** What the from/to dates filter on, e.g. "Imported". */
  dateLabel: string;
  isAvailable: (flags: FeatureFlags) => boolean;
  load: (filters: ReportFilters) => Promise<ReportRow[]>;
  /** Headline counts shown above the table. */
  summarize: (rows: ReportRow[]) => { label: string; value: string }[];
}

/** Far above anything real; a report must never be able to exhaust a function. */
export const MAX_REPORT_ROWS = 5000;
