import Link from 'next/link';
import { Download, FileBarChart } from 'lucide-react';
import { requireBackOfficeAccess } from '@/lib/auth/back-office';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { PageHeader } from '@/components/back-office/page-header';
import { Button } from '@/components/ui/button';
import { availableReports } from '@/lib/back-office/reports';

export const revalidate = 30;

export default async function ReportsPage() {
  await requireBackOfficeAccess();
  const reports = availableReports(await loadFeatureFlags());
  const groups = [...new Set(reports.map((r) => r.group))];

  return (
    <section className="flex-1 p-4 lg:p-8">
      <PageHeader icon={FileBarChart} title="Reports" />

      {reports.length === 0 && (
        <p className="text-sm text-slate-500">
          No reports are available. Data export may be switched off in Settings.
        </p>
      )}

      {groups.map((group) => (
        <div key={group} className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">{group}</h2>
          <ul className="grid gap-3 lg:grid-cols-2">
            {reports
              .filter((r) => r.group === group)
              .map((report) => (
                <li
                  key={report.id}
                  className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-4"
                >
                  <div>
                    <Link
                      href={`/back-office/reports/${report.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {report.title}
                    </Link>
                    <p className="mt-1 text-sm text-slate-600">{report.description}</p>
                  </div>
                  <div className="mt-auto flex gap-2">
                    <Button asChild size="sm">
                      <Link href={`/back-office/reports/${report.id}`}>View</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      {/* Plain <a>: a file, not a page — never prefetched. */}
                      <a href={`/api/back-office/reports/${report.id}`}>
                        <Download className="mr-1.5 h-4 w-4" />
                        Download
                      </a>
                    </Button>
                  </div>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
