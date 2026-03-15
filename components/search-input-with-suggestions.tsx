'use client';

import { useState, useRef, useEffect } from 'react';
import { useSearchSuggestions, type SuggestionItem } from '@/lib/hooks/use-search-suggestions';
import { MapPin, Building2, Loader2 } from 'lucide-react';

export interface SearchInputWithSuggestionsProps {
  value: string;
  onChange: (value: string) => void;
  /** Called on Enter or suggestion select. If item is provided, user selected from dropdown. */
  onSubmit: (value: string, item?: SuggestionItem) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  /** Hero uses dark/glass style; listings use light style */
  variant?: 'hero' | 'listings';
}

function SuggestionIcon({ item, isHero }: { item: SuggestionItem; isHero: boolean }) {
  const cn = isHero ? 'h-4 w-4 text-slate-300' : 'h-4 w-4 text-slate-400';
  if (item.kind === 'listing') return <Building2 className={cn} />;
  return <MapPin className={cn} />;
}

function SuggestionLabel({ item, isHero }: { item: SuggestionItem; isHero: boolean }) {
  const cn = isHero ? 'text-xs text-slate-400' : 'text-xs text-slate-500';
  if (item.kind === 'city') return <span className={cn}>City</span>;
  if (item.kind === 'district') return <span className={cn}>District</span>;
  return <span className={cn}>Listing</span>;
}

export function SearchInputWithSuggestions({
  value,
  onChange,
  onSubmit,
  placeholder = 'City, area, district…',
  className = '',
  inputClassName = '',
  variant = 'listings',
}: SearchInputWithSuggestionsProps) {
  const [focused, setFocused] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const { suggestions, loading } = useSearchSuggestions(value);
  const hasQuery = value.trim().length >= 2;
  const noResults = hasQuery && !loading && suggestions.length === 0;
  const showDropdown = focused && hasQuery && (suggestions.length > 0 || loading || noResults);

  const handleSelect = (item: SuggestionItem) => {
    const q = item.value;
    onChange(q);
    onSubmit(q, item);
    setFocused(false);
    setHighlightIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((i) => (i < suggestions.length - 1 ? i + 1 : i));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((i) => (i > 0 ? i - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (noResults) {
          onChange('');
          onSubmit('', undefined);
          setFocused(false);
        } else if (highlightIndex >= 0 && suggestions[highlightIndex]) {
          handleSelect(suggestions[highlightIndex]);
        } else {
          onSubmit(value, undefined);
        }
        break;
      case 'Escape':
        setFocused(false);
        setHighlightIndex(-1);
        break;
    }
  };

  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const el = listRef.current.children[highlightIndex] as HTMLElement;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex]);

  useEffect(() => {
    setHighlightIndex(-1);
  }, [suggestions]);

  const handleClickOutside = (e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      setFocused(false);
    }
  };

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isHero = variant === 'hero';

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          // Delay to allow click on suggestion to register
          setTimeout(() => setFocused(false), 150);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={showDropdown}
        aria-controls="search-suggestions-list"
        className={inputClassName}
      />

      {showDropdown && (
        <ul
          id="search-suggestions-list"
          ref={listRef}
          role="listbox"
          className={`absolute left-0 right-0 top-full z-[9999] mt-1 max-h-64 overflow-auto rounded-xl border shadow-xl ${
            isHero
              ? 'border-white/20 bg-slate-900/95 backdrop-blur-md'
              : 'border-slate-200 bg-white'
          }`}
        >
          {loading ? (
            <li className={`flex items-center gap-3 px-4 py-3 ${isHero ? 'text-slate-300' : 'text-slate-500'}`}>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Searching…</span>
            </li>
          ) : noResults ? (
            <li
              role="option"
              className={`flex cursor-pointer flex-col gap-2 px-4 py-3 transition-colors ${
                isHero ? 'hover:bg-white/10 text-slate-300' : 'hover:bg-slate-50 text-slate-600'
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange('');
                onSubmit('', undefined);
                setFocused(false);
              }}
            >
              <span className="text-sm">
                No results for &quot;<span className="font-medium">{value.trim()}</span>&quot;
              </span>
              <span className={`text-xs font-medium ${isHero ? 'text-teal-400' : 'text-teal-600'}`}>
                Click to show all listings
              </span>
            </li>
          ) : (
            suggestions.map((item, i) => (
              <li
                key={`${item.kind}-${item.value}-${i}`}
                role="option"
                aria-selected={i === highlightIndex}
                className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors ${
                  i === highlightIndex
                    ? isHero
                      ? 'bg-white/15'
                      : 'bg-slate-100'
                    : isHero
                      ? 'hover:bg-white/10'
                      : 'hover:bg-slate-50'
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(item);
                }}
              >
                <SuggestionIcon item={item} isHero={isHero} />
                <div className="flex-1 min-w-0">
                  <div className={`truncate font-medium ${isHero ? 'text-white' : 'text-slate-900'}`}>{item.value}</div>
                  <SuggestionLabel item={item} isHero={isHero} />
                </div>
                {'listingCount' in item && (
                  <span className={isHero ? 'text-xs text-slate-400' : 'text-xs text-slate-400'}>{item.listingCount} listings</span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
