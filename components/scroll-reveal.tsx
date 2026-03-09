'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  /** 'up' | 'left' | 'right' | 'scale' */
  direction?: 'up' | 'left' | 'right' | 'scale';
  /** Stagger children instead of animating the wrapper */
  stagger?: boolean;
  /** IntersectionObserver threshold (0-1) */
  threshold?: number;
  /** Only trigger once */
  once?: boolean;
}

export function ScrollReveal({
  children,
  className = '',
  direction = 'up',
  stagger = false,
  threshold = 0.15,
  once = true,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      el.classList.add('in-view');
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('in-view');
          if (once) observer.unobserve(el);
        } else if (!once) {
          el.classList.remove('in-view');
        }
      },
      { threshold, rootMargin: '0px 0px -40px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, once]);

  const dirClass =
    direction === 'left' ? 'from-left' :
    direction === 'right' ? 'from-right' :
    direction === 'scale' ? 'from-scale' : '';

  const baseClass = stagger ? 'sr-stagger' : `sr-hidden ${dirClass}`;

  return (
    <div ref={ref} className={`${baseClass} ${className}`}>
      {children}
    </div>
  );
}
