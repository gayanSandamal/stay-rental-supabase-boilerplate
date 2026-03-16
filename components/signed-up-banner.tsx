'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { CheckCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SignedUpBannerProps {
  show: boolean;
}

export function SignedUpBanner({ show }: SignedUpBannerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(false);

  const clearParam = () => {
    setDismissed(true);
    const url = new URL(window.location.href);
    url.searchParams.delete('signed_up');
    const newUrl = url.search ? `${pathname}${url.search}` : pathname;
    router.replace(newUrl);
  };

  if (!show || dismissed) return null;

  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4">
      <CheckCircle className="h-5 w-5 flex-shrink-0 text-teal-600" />
      <p className="flex-1 text-sm text-teal-800">
        Account created successfully. Please check your email to verify your
        account before signing in.
      </p>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 flex-shrink-0 text-teal-600 hover:bg-teal-100 hover:text-teal-800"
        onClick={clearParam}
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
