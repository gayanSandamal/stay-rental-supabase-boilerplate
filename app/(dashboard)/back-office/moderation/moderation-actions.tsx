'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, RefreshCw, Undo2 } from 'lucide-react';
import { publishAnywayAction, requeueAction, restorePhotoAction } from './actions';

export function ModerationActions({
  listingId,
  canPublish,
}: {
  listingId: number;
  canPublish: boolean;
}) {
  const [pending, start] = useTransition();

  const run = (action: (fd: FormData) => Promise<void>) => () => {
    const fd = new FormData();
    fd.set('listingId', String(listingId));
    start(async () => {
      await action(fd);
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      {canPublish && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={run(publishAnywayAction)}
          className="border-emerald-300 text-emerald-800 hover:bg-emerald-50"
        >
          <CheckCircle2 className="mr-1.5 h-4 w-4" />
          Publish anyway
        </Button>
      )}
      <Button size="sm" variant="outline" disabled={pending} onClick={run(requeueAction)}>
        <RefreshCw className="mr-1.5 h-4 w-4" />
        Re-run checks
      </Button>
    </div>
  );
}

export function RestorePhotoButton({
  listingId,
  originalUrl,
}: {
  listingId: number;
  originalUrl: string;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      className="h-7 px-2 text-xs"
      onClick={() => {
        const fd = new FormData();
        fd.set('listingId', String(listingId));
        fd.set('originalUrl', originalUrl);
        start(async () => {
          await restorePhotoAction(fd);
        });
      }}
    >
      <Undo2 className="mr-1 h-3 w-3" />
      Restore
    </Button>
  );
}
