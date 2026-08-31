'use client';

import { useEffect, useState } from 'react';

/**
 * Keyboard navigation for a work list: j/k move the cursor, Enter opens the
 * row, x toggles its selection, `/` focuses search, Esc clears the cursor.
 *
 * Deliberately inert while focus is in a text field, so typing a phone number
 * into search does not start toggling rows.
 */
export function useListKeys<T>({
  items,
  onOpen,
  onToggleSelect,
}: {
  items: T[];
  onOpen: (index: number) => void;
  onToggleSelect: (index: number) => void;
}) {
  const [cursor, setCursor] = useState<number | null>(null);

  useEffect(() => {
    function isTyping(target: EventTarget | null): boolean {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === '/' && !isTyping(event.target)) {
        const search = document.querySelector<HTMLInputElement>('[data-search-input]');
        if (search) {
          event.preventDefault();
          search.focus();
          search.select();
        }
        return;
      }

      if (isTyping(event.target)) return;
      if (items.length === 0) return;

      switch (event.key) {
        case 'j':
          event.preventDefault();
          setCursor((c) => (c === null ? 0 : Math.min(c + 1, items.length - 1)));
          break;
        case 'k':
          event.preventDefault();
          setCursor((c) => (c === null ? 0 : Math.max(c - 1, 0)));
          break;
        case 'Enter':
          if (cursor !== null) {
            event.preventDefault();
            onOpen(cursor);
          }
          break;
        case 'x':
          if (cursor !== null) {
            event.preventDefault();
            onToggleSelect(cursor);
          }
          break;
        case 'Escape':
          setCursor(null);
          break;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [items.length, cursor, onOpen, onToggleSelect]);

  // A cursor pointing past the end after a filter change is worse than none.
  useEffect(() => {
    setCursor((c) => (c !== null && c >= items.length ? null : c));
  }, [items.length]);

  return { cursor, setCursor };
}
