'use client';

import { useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import useSWR from 'swr';

type UserWithEmailVerified = { emailVerified?: boolean } | null;

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function EmailUnverifiedBanner() {
  const [dismissed, setDismissed] = useState(false);
  const { data: user } = useSWR<UserWithEmailVerified>('/api/user', fetcher);

  const shouldShow =
    user && user.emailVerified === false && !dismissed;

  if (!shouldShow) return null;

  return (
    <div className="mx-4 mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:mx-6 sm:mt-4 lg:mx-8">
      <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-600" />
      <p className="flex-1 text-sm text-amber-800">
        Please verify your email address to access all features. Check your
        inbox for the verification link.
      </p>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 flex-shrink-0 text-amber-600 hover:bg-amber-100 hover:text-amber-800"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
