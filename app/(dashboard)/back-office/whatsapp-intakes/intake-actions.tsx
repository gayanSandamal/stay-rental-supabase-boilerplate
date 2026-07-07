'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { updateIntake } from './actions';

/**
 * Reject / reprocess buttons per intake row. Published and rejected intakes
 * are terminal (rejected can still be retried).
 */
export function IntakeActions({
  intakeId,
  status,
}: {
  intakeId: number;
  status: string;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: any, formData: FormData) => updateIntake(_prev, formData),
    null as any
  );

  if (status === 'published') return null;

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="intakeId" value={intakeId} />
      {status !== 'rejected' && (
        <Button
          type="submit"
          name="action"
          value="reject"
          variant="outline"
          size="sm"
          disabled={pending}
          className="text-rose-700 border-rose-200 hover:bg-rose-50"
        >
          Reject
        </Button>
      )}
      <Button
        type="submit"
        name="action"
        value="retry"
        variant="outline"
        size="sm"
        disabled={pending}
      >
        Reprocess
      </Button>
      {state?.error && <span className="text-xs text-rose-600">{state.error}</span>}
      {state?.success && <span className="text-xs text-emerald-600">{state.success}</span>}
    </form>
  );
}
