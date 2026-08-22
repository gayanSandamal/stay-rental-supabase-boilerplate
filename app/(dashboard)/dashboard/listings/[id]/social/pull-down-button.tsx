'use client';

import { useFormStatus } from 'react-dom';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Submit button for the social takedown form.
 *
 * Client-only so `useFormStatus` can show the in-flight state: the action calls
 * out to Facebook's Graph API before redirecting, which on mobile data is
 * several seconds of a button that looks like it did nothing — the exact reason
 * the delete page has one. Disabled while pending also makes repeat taps
 * harmless.
 *
 * Must stay a CHILD of the <form>: useFormStatus reads the nearest enclosing
 * form and reports pending: false anywhere else.
 */
export function PullDownButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="outline"
      disabled={pending}
      aria-busy={pending}
      className="w-full border-red-300 text-red-700 hover:bg-red-50 active:bg-red-100"
    >
      {pending ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <Trash2 className="mr-2 h-4 w-4" aria-hidden />
      )}
      {pending ? 'Removing…' : 'Yes, take it off social media'}
    </Button>
  );
}
