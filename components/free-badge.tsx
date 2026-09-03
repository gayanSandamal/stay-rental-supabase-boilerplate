import { Sparkles } from 'lucide-react';

/**
 * The "100% FREE OF CHARGE" pill.
 *
 * Deliberately one component rather than a copy-pasted span: it appears on the
 * homepage hero, the listings header and the landlord page, and the whole point
 * of the positioning is that it looks and reads the same every time.
 *
 * `variant` matches the two backgrounds the marketing surfaces use — `dark` for
 * the teal hero gradient, `light` for the cream/white sections.
 */
export function FreeBadge({
  label,
  variant = 'light',
  className = '',
}: {
  label: string;
  variant?: 'light' | 'dark';
  className?: string;
}) {
  const tone =
    variant === 'dark'
      ? 'bg-amber-400/20 text-amber-200 border-amber-300/40'
      : 'bg-emerald-50 text-emerald-700 border-emerald-200';

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-bold tracking-wider uppercase ${tone} ${className}`}
    >
      <Sparkles className="h-3 w-3 shrink-0" />
      {label}
    </span>
  );
}
