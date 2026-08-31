'use client';

import { useCallback, useMemo, useState } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { DetailDrawer } from '@/components/back-office/detail-drawer';
import { BulkActionBar } from '@/components/back-office/bulk-action-bar';
import { ThumbStrip } from '@/components/back-office/thumb-strip';
import { useListKeys } from '@/components/back-office/use-list-keys';
import { shortAge, fullTimestamp } from '@/lib/back-office/format';
import { cn } from '@/lib/utils';
import { IntakeActions } from './intake-actions';
import { BulkIntakeActions } from './bulk-intake-actions';

export type IntakeRow = {
  id: number;
  status: string;
  channel: string;
  profileName: string | null;
  fromNumber: string;
  messageText: string | null;
  failureReason: string | null;
  listingId: number | null;
  photoCount: number;
  photos: string[];
  needsInfoRounds: number;
  askedFields: string | null;
  hasUnsupportedMedia: boolean;
  replyLanguage: string | null;
  lastMessageAt: string;
};

function parseAsked(raw: string | null): string[] {
  try {
    const v = JSON.parse(raw ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function IntakeList({ rows }: { rows: IntakeRow[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const { cursor, setCursor } = useListKeys({
    items: rows,
    onOpen: (i) => setOpenIndex(i),
    onToggleSelect: (i) => toggle(rows[i].id),
  });

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = selected.size > 0 && !allSelected;

  const open = openIndex === null ? null : rows[openIndex];
  const selectedIds = useMemo(() => [...selected], [selected]);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-9">
              <Checkbox
                checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                onCheckedChange={(checked) =>
                  setSelected(checked ? new Set(rows.map((r) => r.id)) : new Set())
                }
                aria-label={`Select all ${rows.length} intakes on this page`}
              />
            </TableHead>
            <TableHead className="w-28">Status</TableHead>
            <TableHead className="w-32">Photos</TableHead>
            <TableHead className="w-56">Landlord</TableHead>
            <TableHead>Message</TableHead>
            <TableHead className="w-16 text-right">Age</TableHead>
            <TableHead className="w-44 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => {
            const isSelected = selected.has(row.id);
            return (
              <TableRow
                key={row.id}
                data-state={isSelected ? 'selected' : undefined}
                onClick={() => {
                  setCursor(index);
                  setOpenIndex(index);
                }}
                className={cn(
                  'cursor-pointer',
                  cursor === index && 'ring-2 ring-inset ring-teal-600/40'
                )}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggle(row.id)}
                    aria-label={`Select intake #${row.id}`}
                  />
                </TableCell>

                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <StatusBadge status={row.status} />
                    {row.needsInfoRounds > 0 && (
                      <span className="text-[11px] text-slate-500 tabular-nums">
                        asked {row.needsInfoRounds}×
                      </span>
                    )}
                  </div>
                </TableCell>

                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <ThumbStrip
                      thumbs={row.photos.map((url) => ({ url }))}
                      max={2}
                    />
                    {row.hasUnsupportedMedia && (
                      <ImageOff
                        className="h-3.5 w-3.5 text-amber-600"
                        aria-label="Sent media we cannot ingest"
                      />
                    )}
                  </div>
                </TableCell>

                <TableCell>
                  <div className="truncate text-sm font-semibold text-slate-900">
                    {row.profileName ?? 'Unknown'}
                  </div>
                  <div className="font-mono text-xs text-slate-500">+{row.fromNumber}</div>
                </TableCell>

                <TableCell className="max-w-0">
                  <p className="line-clamp-2 text-[13px] leading-[1.125rem] text-slate-700">
                    {row.messageText ?? <span className="text-slate-400">no text</span>}
                  </p>
                  {row.failureReason && (
                    <p className="mt-0.5 line-clamp-1 font-mono text-[11px] text-rose-700">
                      {row.failureReason}
                    </p>
                  )}
                </TableCell>

                <TableCell
                  className="text-right text-xs text-slate-500 tabular-nums"
                  title={fullTimestamp(row.lastMessageAt)}
                >
                  {shortAge(row.lastMessageAt)}
                </TableCell>

                <TableCell onClick={(e) => e.stopPropagation()} className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {row.listingId && (
                      <Link
                        href={`/dashboard/listings/${row.listingId}`}
                        className="inline-flex items-center gap-1 font-mono text-xs text-teal-700 hover:underline"
                      >
                        #{row.listingId}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                    <IntakeActions intakeId={row.id} status={row.status} />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <DetailDrawer
        open={open !== null}
        onOpenChange={(next) => !next && setOpenIndex(null)}
        title={open ? (open.profileName ?? 'Unknown landlord') : ''}
        subtitle={open ? `+${open.fromNumber} · intake #${open.id}` : undefined}
        footer={
          open ? <IntakeActions intakeId={open.id} status={open.status} /> : null
        }
      >
        {open && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={open.status} />
              <Badge variant="outline">{open.channel}</Badge>
              {open.replyLanguage && <Badge variant="neutral">{open.replyLanguage}</Badge>}
              <span className="text-xs text-slate-500">
                {fullTimestamp(open.lastMessageAt)}
              </span>
            </div>

            {open.failureReason && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                <h3 className="text-xs font-semibold text-rose-900">Why it stopped</h3>
                <p className="mt-1 font-mono text-xs text-rose-800">{open.failureReason}</p>
              </div>
            )}

            {parseAsked(open.askedFields).length > 0 && (
              <div>
                <h3 className="mb-1 text-xs font-semibold text-slate-500">
                  Last asked for ({open.needsInfoRounds}× so far)
                </h3>
                <div className="flex flex-wrap gap-1">
                  {parseAsked(open.askedFields).map((field) => (
                    <Badge key={field} variant="warn">
                      {field}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="mb-1 text-xs font-semibold text-slate-500">
                Full message
              </h3>
              <pre className="max-h-72 overflow-y-auto rounded-lg bg-slate-50 p-3 font-mono text-xs whitespace-pre-wrap text-slate-800">
                {open.messageText ?? 'No text was sent.'}
              </pre>
            </div>

            {open.photos.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold text-slate-500">
                  {open.photoCount} photo(s)
                </h3>
                <ThumbStrip
                  thumbs={open.photos.map((url) => ({ url }))}
                  max={12}
                  className="flex-wrap"
                />
              </div>
            )}

            {open.listingId && (
              <Link
                href={`/dashboard/listings/${open.listingId}`}
                className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:underline"
              >
                Open listing #{open.listingId}
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        )}
      </DetailDrawer>

      <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <BulkIntakeActions
          intakeIds={selectedIds}
          onDone={() => setSelected(new Set())}
        />
      </BulkActionBar>
    </>
  );
}
