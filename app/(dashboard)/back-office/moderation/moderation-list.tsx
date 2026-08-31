'use client';

import { useCallback, useState, useTransition } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AlertTriangle, ExternalLink, RefreshCw, Undo2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DetailDrawer } from '@/components/back-office/detail-drawer';
import { BulkActionBar } from '@/components/back-office/bulk-action-bar';
import { ThumbStrip } from '@/components/back-office/thumb-strip';
import { useListKeys } from '@/components/back-office/use-list-keys';
import { cn } from '@/lib/utils';
import { ModerationActions, RestorePhotoButton } from './moderation-actions';
import { bulkRequeueAction, bulkRestorePhotosAction } from './actions';

export type ModerationPhoto = {
  url: string;
  verdict: string;
  reason: string | null;
};

export type ModerationRow = {
  id: number;
  title: string;
  city: string | null;
  status: string;
  moderationStatus: string;
  moderationLanguage: string | null;
  moderationSummary: string | null;
  moderationAttempts: number;
  publicCount: number;
  trackedCount: number;
  photos: ModerationPhoto[];
};

const VERDICT_TONE: Record<string, 'ok' | 'danger' | 'queued' | 'neutral'> = {
  pass: 'ok',
  reject: 'danger',
  queued: 'queued',
};

export function ModerationList({ rows }: { rows: ModerationRow[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [pending, start] = useTransition();

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

  const runBulk = (action: (fd: FormData) => Promise<void>) => () => {
    const fd = new FormData();
    fd.set('listingIds', [...selected].join(','));
    start(async () => {
      await action(fd);
      setSelected(new Set());
    });
  };

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
                aria-label={`Select all ${rows.length} listings on this page`}
              />
            </TableHead>
            <TableHead className="w-28">Check</TableHead>
            <TableHead className="w-56">Photos</TableHead>
            <TableHead>Listing</TableHead>
            <TableHead className="w-28">Coverage</TableHead>
            <TableHead className="w-48 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => {
            const isSelected = selected.has(row.id);
            const uncovered = row.publicCount > row.trackedCount;
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
                    aria-label={`Select listing #${row.id}`}
                  />
                </TableCell>

                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <StatusBadge status={row.moderationStatus} />
                    <span className="text-[11px] text-slate-500 tabular-nums">
                      attempt {row.moderationAttempts}
                      {row.moderationLanguage ? ` · ${row.moderationLanguage}` : ''}
                    </span>
                  </div>
                </TableCell>

                <TableCell>
                  <ThumbStrip
                    thumbs={row.photos.map((p) => ({ url: p.url, verdict: p.verdict }))}
                    max={5}
                  />
                </TableCell>

                <TableCell className="max-w-0">
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/dashboard/listings/${row.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="truncate text-sm font-semibold text-slate-900 hover:underline"
                    >
                      {row.title}
                    </Link>
                    <span className="shrink-0 font-mono text-xs text-slate-500 tabular-nums">
                      #{row.id}
                    </span>
                    {row.city && (
                      <span className="shrink-0 text-xs text-slate-500">· {row.city}</span>
                    )}
                  </div>
                  {row.moderationSummary && (
                    <p className="mt-0.5 line-clamp-1 text-[13px] text-slate-600">
                      {row.moderationSummary}
                    </p>
                  )}
                </TableCell>

                <TableCell>
                  {/*
                    A public photo no manifest entry accounts for is a bug worth
                    seeing. It stays visible and amber at every density.
                  */}
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-[11px] tabular-nums',
                      uncovered ? 'bg-amber-100 font-semibold text-amber-900' : 'text-slate-500'
                    )}
                    title="public photos vs manifest entries"
                  >
                    {row.publicCount} / {row.trackedCount}
                    {uncovered ? ' ⚠' : ''}
                  </span>
                </TableCell>

                <TableCell onClick={(e) => e.stopPropagation()} className="text-right">
                  <ModerationActions
                    listingId={row.id}
                    canPublish={row.moderationStatus !== 'passed'}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <DetailDrawer
        open={open !== null}
        onOpenChange={(next) => !next && setOpenIndex(null)}
        title={open?.title ?? ''}
        subtitle={open ? `#${open.id}${open.city ? ` · ${open.city}` : ''}` : undefined}
        footer={
          open ? (
            <ModerationActions
              listingId={open.id}
              canPublish={open.moderationStatus !== 'passed'}
            />
          ) : null
        }
      >
        {open && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={open.moderationStatus} />
              <Badge variant="outline">listing {open.status}</Badge>
              {open.moderationLanguage && (
                <Badge variant="neutral">{open.moderationLanguage}</Badge>
              )}
              <span className="text-xs text-slate-500 tabular-nums">
                attempt {open.moderationAttempts}
              </span>
            </div>

            {open.moderationSummary && (
              <p className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>{open.moderationSummary}</span>
              </p>
            )}

            {open.publicCount > open.trackedCount && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <strong>
                  {open.publicCount - open.trackedCount} public photo(s) are not covered by the
                  manifest.
                </strong>{' '}
                The checks never accounted for them — worth escalating.
              </p>
            )}

            <div>
              <h3 className="mb-2 text-xs font-semibold text-slate-500">
                Photos — original, as the checks saw them
              </h3>
              <div className="flex flex-wrap gap-3">
                {open.photos.map((photo) => (
                  <div key={photo.url} className="w-40">
                    <div className="relative h-24 w-40 overflow-hidden rounded-lg bg-slate-100">
                      <Image
                        src={photo.url}
                        alt={`photo — ${photo.verdict}`}
                        fill
                        className={cn(
                          'object-cover',
                          photo.verdict === 'reject' && 'opacity-40'
                        )}
                        sizes="160px"
                        unoptimized
                      />
                      <Badge
                        variant={VERDICT_TONE[photo.verdict] ?? 'neutral'}
                        className="absolute left-1 top-1 min-w-0"
                      >
                        {photo.verdict}
                      </Badge>
                    </div>
                    {photo.reason && (
                      <p className="mt-1 text-xs text-slate-600">{photo.reason}</p>
                    )}
                    {photo.verdict === 'reject' && (
                      <div className="mt-1">
                        <RestorePhotoButton listingId={open.id} originalUrl={photo.url} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {open.photos.some((p) => p.verdict === 'reject') && (
                <p className="mt-3 text-xs text-slate-500">
                  Restoring a photo is remembered permanently — the same image will pass on
                  every future check.
                </p>
              )}
            </div>

            <Link
              href={`/dashboard/listings/${open.id}`}
              className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:underline"
            >
              Open listing #{open.id}
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      </DetailDrawer>

      <BulkActionBar
        count={selected.size}
        onClear={() => setSelected(new Set())}
        pending={pending}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={runBulk(bulkRequeueAction)}
        >
          <RefreshCw className="h-4 w-4" />
          Re-run checks
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => {
            if (
              !window.confirm(
                `Restore every rejected photo on ${selected.size} listing(s)?\n\n` +
                  'This is permanent: each restored image will pass every future check.'
              )
            ) {
              return;
            }
            runBulk(bulkRestorePhotosAction)();
          }}
        >
          <Undo2 className="h-4 w-4" />
          Restore rejected photos
        </Button>
      </BulkActionBar>
    </>
  );
}
