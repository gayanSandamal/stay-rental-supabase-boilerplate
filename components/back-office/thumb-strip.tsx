import Image from 'next/image';
import { cn } from '@/lib/utils';

export type Thumb = {
  url: string;
  /** Per-photo moderation verdict, when the surface has one. */
  verdict?: 'pass' | 'reject' | string;
};

const VERDICT_RING: Record<string, string> = {
  pass: 'ring-emerald-500',
  reject: 'ring-rose-500',
};

/**
 * Up to five 40px thumbnails inline, with a +N chip for the rest.
 *
 * Full photo grids at expanded size belong in the detail drawer, never in a
 * row. The Moderation screen painting every original photo of every listing
 * across four sections is most of why it felt heavy.
 */
export function ThumbStrip({
  thumbs,
  max = 5,
  className,
}: {
  thumbs: Thumb[];
  max?: number;
  className?: string;
}) {
  if (thumbs.length === 0) {
    return <span className="text-xs text-slate-400">no photos</span>;
  }

  const shown = thumbs.slice(0, max);
  const rest = thumbs.length - shown.length;

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {shown.map((thumb) => (
        <span
          key={thumb.url}
          className={cn(
            'relative block h-10 w-10 shrink-0 overflow-hidden rounded-sm bg-slate-100',
            thumb.verdict && VERDICT_RING[thumb.verdict]
              ? `ring-2 ${VERDICT_RING[thumb.verdict]}`
              : ''
          )}
        >
          <Image
            src={thumb.url}
            alt={thumb.verdict ? `photo — ${thumb.verdict}` : 'listing photo'}
            fill
            className={cn('object-cover', thumb.verdict === 'reject' && 'opacity-40')}
            sizes="40px"
            unoptimized
            loading="lazy"
          />
        </span>
      ))}
      {rest > 0 && (
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-slate-100 text-xs font-medium text-slate-600 tabular-nums">
          +{rest}
        </span>
      )}
    </div>
  );
}
