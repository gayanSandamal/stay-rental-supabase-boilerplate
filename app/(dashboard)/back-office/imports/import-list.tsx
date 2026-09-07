import Link from 'next/link';
import { ExternalLink, ImageOff } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { shortAge, fullTimestamp } from '@/lib/back-office/format';

export type ImportRow = {
  id: number;
  sourceUrl: string;
  sourcePlatform: string;
  resolvedVia: string;
  status: string;
  ownerName: string | null;
  ownerPhone: string | null;
  listingId: number | null;
  notifyOutcome: string | null;
  title: string | null;
  photoCount: number;
  createdAt: string;
};

/** What the operator most needs to know at a glance: did we actually get anything? */
const VIA_LABELS: Record<string, string> = {
  graph: 'full post',
  og: 'preview only',
  manual: 'pasted by hand',
};

/**
 * A server component: this list has no selection, no drawer and no bulk
 * actions, so there is nothing for the client to do. Every row is a link to the
 * review screen, which is where the work happens.
 */
export function ImportList({ rows }: { rows: ImportRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Listing</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Added</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id} className="hover:bg-slate-50">
            <TableCell>
              <Link
                href={`/back-office/imports/${row.id}`}
                className="font-medium text-slate-900 hover:underline"
              >
                {row.title ?? <span className="text-slate-400">Untitled draft</span>}
              </Link>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                <span>#{row.id}</span>
                {row.photoCount > 0 ? (
                  <span>
                    {row.photoCount} photo{row.photoCount === 1 ? '' : 's'}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-amber-700">
                    <ImageOff className="h-3 w-3" /> no photos
                  </span>
                )}
              </div>
            </TableCell>

            <TableCell className="text-sm">
              <div className="text-slate-700">
                {row.sourcePlatform === 'facebook_group' ? 'Facebook group' : 'Facebook page'}
              </div>
              <a
                href={row.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 hover:underline"
              >
                {VIA_LABELS[row.resolvedVia] ?? row.resolvedVia}
                <ExternalLink className="h-3 w-3" />
              </a>
            </TableCell>

            <TableCell className="text-sm">
              <div className="text-slate-700">{row.ownerName ?? '—'}</div>
              <div className="text-xs text-slate-500">{row.ownerPhone ?? 'no number yet'}</div>
            </TableCell>

            <TableCell>
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge status={row.status} />
                {row.listingId && (
                  <Link
                    href={`/dashboard/listings/${row.listingId}`}
                    className="text-xs text-teal-700 hover:underline"
                  >
                    #{row.listingId}
                  </Link>
                )}
                {/*
                  A dry run is not a delivered message. Saying "notified" for
                  something never sent is the same lie as a social row reading
                  `posted` for a post that was never made.
                */}
                {row.notifyOutcome === 'dry_run' && <Badge variant="warn">not sent</Badge>}
                {row.notifyOutcome === 'failed' && <Badge variant="danger">send failed</Badge>}
              </div>
            </TableCell>

            <TableCell className="text-right text-sm text-slate-500">
              <span title={fullTimestamp(row.createdAt)}>{shortAge(row.createdAt)}</span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
