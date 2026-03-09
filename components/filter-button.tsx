'use client';

import { Button } from '@/components/ui/button';
import { SlidersHorizontal } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

interface FilterButtonProps {
  onClick: () => void;
}

export function FilterButton({ onClick }: FilterButtonProps) {
  const searchParams = useSearchParams();
  const activeFilterCount = Array.from(searchParams.keys()).filter(
    key => key !== 'sortBy' || searchParams.get(key) !== 'newest'
  ).length;

  return (
    <Button
      variant="outline"
      onClick={onClick}
      className="relative h-10"
    >
      <SlidersHorizontal className="h-4 w-4 mr-2" />
      Filters
      {activeFilterCount > 0 && (
        <span className="ml-2 bg-teal-800 text-white text-xs font-semibold px-1.5 py-0.5 rounded-full min-w-[20px]">
          {activeFilterCount}
        </span>
      )}
    </Button>
  );
}
