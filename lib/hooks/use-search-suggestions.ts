'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export type SuggestionItem =
  | { kind: 'city'; value: string; listingCount: number }
  | { kind: 'district'; value: string; listingCount: number }
  | { kind: 'listing'; value: string; listingId: number };

const DEBOUNCE_MS = 200;
const MIN_CHARS = 2;

export function useSearchSuggestions(query: string) {
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.trim().length < MIN_CHARS) {
      setSuggestions([]);
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ q: q.trim(), limit: '8' });
      const res = await fetch(`/api/search/suggestions?${params}`, {
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error('Failed to fetch');

      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Unknown error');
      setSuggestions([]);
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    if (query.trim().length < MIN_CHARS) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    timeoutRef.current = setTimeout(() => {
      fetchSuggestions(query);
    }, DEBOUNCE_MS);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [query, fetchSuggestions]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return { suggestions, loading, error };
}
