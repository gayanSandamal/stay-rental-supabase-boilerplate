import * as React from 'react';

// Minimal rounded house outline (super-minimal, single colour via currentColor).
const HOUSE_D =
  'M43.09,26.76 Q50.00,21.00 56.91,26.76 L73.09,40.24 Q80.00,46.00 80.00,55.00 ' +
  'L80.00,73.00 Q80.00,82.00 71.00,82.00 L29.00,82.00 Q20.00,82.00 20.00,73.00 ' +
  'L20.00,55.00 Q20.00,46.00 26.91,40.24 L43.09,26.76 Z';

interface EasyRentMarkProps extends React.SVGProps<SVGSVGElement> {
  /** pixel size (width & height) */
  size?: number;
  /** stroke weight in the 100x100 viewBox */
  strokeWidth?: number;
  /** accessible label; omit for decorative use */
  title?: string;
}

/**
 * Easy Rent mark — a minimal rounded house outline. Single colour: the stroke
 * uses `currentColor`, so set the colour via a text-colour class on the element
 * (e.g. className="text-teal-700") and it adapts to light/dark surfaces.
 */
export function EasyRentMark({
  size = 40,
  strokeWidth = 7,
  title,
  ...props
}: EasyRentMarkProps) {
  const a11y = title
    ? { role: 'img', 'aria-label': title }
    : { 'aria-hidden': true as const };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...a11y}
      {...props}
    >
      <path
        d={HOUSE_D}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Backwards-compatible alias (older imports used EasyRentSeal).
export const EasyRentSeal = EasyRentMark;

/**
 * Tracked, all-caps Easy Rent wordmark. Inherits text colour so it adapts to
 * light/dark surfaces.
 */
export function EasyRentWordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-semibold tracking-[0.18em] ${className}`}>
      EASY RENT
    </span>
  );
}

export default EasyRentMark;
