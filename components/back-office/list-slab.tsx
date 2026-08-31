import { cn } from '@/lib/utils';

/**
 * The list container. Rows sit on one white slab above the page ground, so a
 * long list reads as a single surface rather than a stack of floating cards.
 * Flat by design — the back office uses borders and tonal grounds for
 * structure, never shadow, which at row density is just noise.
 */
export function ListSlab({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        '-mx-1 overflow-hidden rounded-b-lg border border-slate-200 bg-white',
        className
      )}
    >
      {children}
    </div>
  );
}
