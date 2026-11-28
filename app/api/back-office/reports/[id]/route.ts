import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { logAudit } from '@/lib/db/audit-logger';
import { findReport } from '@/lib/back-office/reports';
import { parseReportFilters } from '@/lib/back-office/reports/filters';
import { reportFileName, toCsv } from '@/lib/back-office/reports/csv';

export const maxDuration = 60;

/** Download one report as CSV. Same filters as the screen it is linked from. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin' && user.role !== 'ops') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const flags = await loadFeatureFlags();
  const { id } = await params;
  const report = findReport(id, flags);
  if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

  const query = request.nextUrl.searchParams;
  const filters = parseReportFilters(report, {
    view: query.get('view'),
    from: query.get('from'),
    to: query.get('to'),
  });
  const rows = await report.load(filters);
  const now = new Date();

  // These files carry owners' phone numbers off the platform, so every download
  // is on the record before it leaves.
  await logAudit({
    action: 'data_exported',
    entityType: 'report',
    userId: user.id,
    metadata: {
      report: report.id,
      view: filters.view,
      from: filters.from?.toISOString() ?? null,
      to: filters.to?.toISOString() ?? null,
      count: rows.length,
      format: 'csv',
    },
  });

  return new NextResponse(
    toCsv(
      report.columns.map((c) => c.label),
      rows.map((row) => report.columns.map((c) => row[c.key] ?? null))
    ),
    {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${reportFileName(report.id, now)}"`,
        'Cache-Control': 'private, no-store',
      },
    }
  );
}
