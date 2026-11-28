'use client';

import { cn } from '@/lib/utils';

/** A two-or-three way switch. Real radios, so it is keyboard and form friendly. */
export function SegmentedToggle({
  id,
  name,
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  id?: string;
  name: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={label}
      className="inline-flex max-w-full flex-wrap gap-1 rounded-md border border-slate-200 bg-slate-50 p-1"
    >
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            'cursor-pointer rounded px-3 py-1.5 text-sm font-medium focus-within:ring-2 focus-within:ring-teal-500',
            value === option.value
              ? 'bg-teal-800 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900',
            disabled && 'cursor-not-allowed opacity-50'
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            disabled={disabled}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}
