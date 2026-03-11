'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { FilterButtonWithModal } from '@/components/filter-button-with-modal';
import { SearchInputWithSuggestions } from '@/components/search-input-with-suggestions';

export function ListingsSearchFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState('');

  useEffect(() => {
    setQuery(searchParams.get('search') || '');
  }, [searchParams]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (query.trim()) {
      params.set('search', query.trim());
    } else {
      params.delete('search');
    }
    router.push(`/listings?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-3">
      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(e); }} className="flex-1">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 z-10 pointer-events-none" />
          <SearchInputWithSuggestions
            value={query}
            onChange={setQuery}
            onSubmit={(q, item) => {
              if (item?.kind === 'listing' && 'listingId' in item) {
                router.push(`/listings/${item.listingId}`);
              } else {
                const params = new URLSearchParams(searchParams.toString());
                if (q.trim()) params.set('search', q.trim());
                else params.delete('search');
                router.push(`/listings?${params.toString()}`);
              }
            }}
            placeholder="Search by location, property type, features..."
            variant="listings"
            inputClassName="w-full h-11 pl-10 pr-4 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent shadow-sm"
          />
        </div>
      </form>
      <FilterButtonWithModal />
    </div>
  );
}
