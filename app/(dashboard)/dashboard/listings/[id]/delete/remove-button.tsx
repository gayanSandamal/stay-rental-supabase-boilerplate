'use client';

import { useFormStatus } from 'react-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Submit button for the archive form.
 *
 * A client component purely so `useFormStatus` can report the in-flight state:
 * the server action does DB work and then redirects, which on a phone on mobile
 * data is several seconds of a button that looks like it did nothing. Landlords
 * were tapping it repeatedly. `disabled` while pending also makes the repeat
 * taps harmless.
 *
 * Must stay a CHILD of the <form> — useFormStatus reads the nearest enclosing
 * form and returns pending: false anywhere else.
 */
export function RemoveListingButton() {
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
        <AlertTriangle className="mr-2 h-4 w-4" aria-hidden />
      )}
      {pending ? 'Removing…' : 'Yes, remove it'}
    </Button>
  );
}
