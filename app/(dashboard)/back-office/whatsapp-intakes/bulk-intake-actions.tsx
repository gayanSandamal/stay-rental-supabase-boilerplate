'use client';

import { useActionState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { bulkUpdateIntakes } from './actions';

/** Reject / reprocess applied to the current selection. */
export function BulkIntakeActions({
  intakeIds,
  onDone,
}: {
  intakeIds: number[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: any, formData: FormData) => bulkUpdateIntakes(_prev, formData),
    null as any
  );

  useEffect(() => {
    if (state?.success) onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="intakeIds" value={intakeIds.join(',')} />
      <Button
        type="submit"
        name="action"
        value="retry"
        variant="outline"
        size="sm"
        disabled={pending}
      >
        Reprocess selected
      </Button>
      <Button
        type="submit"
        name="action"
        value="reject"
        variant="outline"
        size="sm"
        disabled={pending}
        className="border-rose-200 text-rose-700 hover:bg-rose-50"
      >
        Reject selected
      </Button>
      {state?.error && <span className="text-xs text-rose-600">{state.error}</span>}
    </form>
  );
}
