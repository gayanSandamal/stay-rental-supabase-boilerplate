'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { listHref, type ListParams } from '@/lib/back-office/list-params';

/**
 * Debounced URL-writing search box.
 *
 * Takes the current params as a prop rather than reading `useSearchParams()`,
 * which keeps this component free of a Suspense boundary and keeps the server
 * the single source of truth for view state.
 */
export function SearchInput({
  basePath,
  params,
  placeholder,
}: {
  basePath: string;
  params: ListParams;
  placeholder: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(params.q);
  // The URL is authoritative: if it changes underneath us (back button, a
  // "clear filters" link) the box must follow rather than hold a stale query.
  const lastPushed = useRef(params.q);

  useEffect(() => {
    if (params.q !== lastPushed.current) {
      lastPushed.current = params.q;
      setValue(params.q);
    }
  }, [params.q]);

  useEffect(() => {
    if (value === lastPushed.current) return;
    const timer = setTimeout(() => {
      lastPushed.current = value;
      router.replace(listHref(basePath, params, { q: value }));
    }, 300);
    return () => clearTimeout(timer);
  }, [value, basePath, params, router]);

  return (
    <div className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <Input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 pl-8 pr-8 text-sm"
        data-search-input
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue('')}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded text-slate-400 hover:text-slate-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
