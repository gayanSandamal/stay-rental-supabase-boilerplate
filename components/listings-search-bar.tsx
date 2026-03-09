'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, CircleIcon, Plus } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FilterButtonWithModal } from '@/components/filter-button-with-modal';
import { UserMenu } from '@/components/user-menu';

type User = {
  id: number;
  email: string;
  name: string | null;
  role: string;
} | null;

interface ListingsSearchBarProps {
  user?: User;
}

export function ListingsSearchBar({ user }: ListingsSearchBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');

  // Initialize from URL params
  useEffect(() => {
    setSearchQuery(searchParams.get('search') || '');
  }, [searchParams]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const params = new URLSearchParams(searchParams.toString());

    if (searchQuery.trim()) {
      params.set('search', searchQuery.trim());
    } else {
      params.delete('search');
    }

    router.push(`/listings?${params.toString()}`);
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Top row: Logo, Search Bar, and Sign Up */}
      <div className="flex items-center justify-between gap-4 w-full">
        {/* Logo on the left */}
        <Link href="/" className="flex items-center flex-shrink-0">
          <CircleIcon className="h-6 w-6 text-teal-700" />
          <div className="ml-2 hidden sm:block">
            <span className="text-lg font-semibold text-gray-900">Stay Rental</span>
          </div>
        </Link>

        <div className="flex items-center w-full">
          {/* Search form in the middle */}
          <form onSubmit={handleSubmit} className="flex-1 w-full max-w-2xl">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by location, property type, features..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-10 pr-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent"
              />
            </div>
          </form>

          {/* Bottom row: Filters and List Property Button */}
          <div className="flex items-center gap-3 ml-2">
            <Suspense fallback={<Button variant="outline">Filters</Button>}>
              <FilterButtonWithModal />
            </Suspense>
            {user && (
              <Button
                asChild
                className="bg-teal-800 hover:bg-teal-900 whitespace-nowrap"
              >
                <Link href="/dashboard/listings/new">
                  <Plus className="mr-2 h-4 w-4" />
                  List Your Property
                </Link>
              </Button>
            )}
          </div>
        </div>

        <div className="flex-shrink-0">
          <Suspense fallback={<div className="h-9 w-9 rounded-full bg-gray-200 animate-pulse" />}>
            <UserMenu />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
