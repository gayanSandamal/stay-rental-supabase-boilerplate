import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Download, FileBarChart } from 'lucide-react';
import { requireBackOfficeAccess } from '@/lib/auth/back-office';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { PageHeader } from '@/components/back-office/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { findReport } from '@/lib/back-office/reports';
import { parseReportFilters } from '@/lib/back-office/reports/filters';
import type { Cell, ReportColumn } from '@/lib/back-office/reports/types';

export const revalidate = 30;
export const maxDuration = 60;

/** The screen is for reading; the download always has every row. */
const SCREEN_ROWS = 200;

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireBackOfficeAccess();
  const flags = await loadFeatureFlags();
  const { id } = await params;
  const report = findReport(id, flags);
  if (!report) notFound();

  const query = await searchParams;
  const one = (key: string) => (typeof query[key] === 'string' ? (query[key] as string) : '');
  const filters = parseReportFilters(report, {
    view: one('view'),
    from: one('from'),
    to: one('to'),
  });
  // Echo a date back only if it was understood, so the form never shows a
  // filter that is not applied.
  const from = filters.from ? one('from') : '';
  const to = filters.to ? one('to') : '';

  const rows = await report.load(filters);
  const columns = report.columns.filter((c) => !c.csvOnly);

  const href = (base: string, view: string) => {
    const search = new URLSearchParams({ view });
    if (from) search.set('from', from);
    if (to) search.set('to', to);
    return `${base}?${search}`;
  };
  const basePath = `/back-office/reports/${report.id}`;

  return (
    <section className="flex-1 p-4 lg:p-8">
      <Link
        href="/back-office/reports"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Reports
      </Link>

      <PageHeader
        icon={FileBarChart}
        title={report.title}
        actions={
          <Button asChild>
            <a href={href(`/api${basePath}`, filters.view)}>
              <Download className="mr-1.5 h-4 w-4" />
              Download CSV
            </a>
          </Button>
        }
      />
      <p className="mb-4 max-w-3xl text-sm text-slate-600">{report.description}</p>

      <dl className="mb-4 flex flex-wrap gap-x-8 gap-y-2">
        {report.summarize(rows).map((item) => (
          <div key={item.label}>
            <dt className="text-xs text-slate-500">{item.label}</dt>
            <dd className="text-xl font-bold text-slate-900 tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap items-end gap-3 rounded-t-lg border border-b-0 border-slate-200 bg-white px-3 py-2">
        <nav className="flex flex-wrap gap-1" aria-label="Report view">
          {report.views.map((view) => (
            <Link
              key={view.key}
              href={href(basePath, view.key)}
              aria-current={view.key === filters.view ? 'page' : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                view.key === filters.view
                  ? 'bg-teal-50 text-teal-900'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {view.label}
            </Link>
          ))}
        </nav>
        {/* A GET form: the filters live in the URL, like every other list here. */}
        <form className="ml-auto flex flex-wrap items-end gap-2" action={basePath}>
          <input type="hidden" name="view" value={filters.view} />
          <div>
            <Label htmlFor="from" className="text-xs">
              {report.dateLabel} from
            </Label>
            <Input id="from" name="from" type="date" defaultValue={from} className="h-9" />
          </div>
          <div>
            <Label htmlFor="to" className="text-xs">
              to
            </Label>
            <Input id="to" name="to" type="date" defaultValue={to} className="h-9" />
          </div>
          <Button type="submit" variant="outline" size="sm">
            Apply
          </Button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-b-lg border border-slate-200 bg-white">
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Nothing to show for this view and dates.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c.key} className="whitespace-nowrap">
                    {c.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, SCREEN_ROWS).map((row, i) => (
                <TableRow key={i}>
                  {columns.map((c) => (
                    <TableCell
                      key={c.key}
                      className={`align-top text-sm ${
                        c.wide ? 'min-w-56 whitespace-normal' : 'whitespace-nowrap'
                      }`}
                    >
                      <CellValue column={c} value={row[c.key] ?? null} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      {rows.length > SCREEN_ROWS && (
        <p className="mt-2 text-xs text-slate-500">
          Showing the first {SCREEN_ROWS} of {rows.length.toLocaleString()}. The download has
          all of them.
        </p>
      )}
    </section>
  );
}

function CellValue({ column, value }: { column: ReportColumn; value: Cell }) {
  if (value === null || value === '') return <span className="text-slate-400">—</span>;
  // Only ever an http(s) href: these values originate in pasted adverts.
  if (column.link && /^https?:\/\//.test(String(value))) {
    return (
      <a
        href={String(value)}
        target="_blank"
        rel="noreferrer noopener"
        className="text-teal-700 hover:underline"
      >
        Open
      </a>
    );
  }
  return <>{typeof value === 'number' && column.key !== 'id' ? value.toLocaleString() : value}</>;
}
