'use client';

import { useEffect, useRef, useState } from 'react';

interface AnimatedCounterProps {
  value: number | string;
  suffix?: string;
  prefix?: string;
  duration?: number;
  className?: string;
}

export function AnimatedCounter({
  value,
  suffix = '',
  prefix = '',
  duration = 1800,
  className = '',
}: AnimatedCounterProps) {
  const [display, setDisplay] = useState('0');
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setDisplay(String(value));
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          observer.unobserve(el);
          animateValue();
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function animateValue() {
    const strVal = String(value);
    const numericPart = parseFloat(strVal.replace(/[^0-9.]/g, ''));
    const hasPercent = strVal.includes('%');

    if (isNaN(numericPart)) {
      setDisplay(strVal);
      return;
    }

    const isFloat = strVal.includes('.');
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = numericPart * eased;

      if (isFloat) {
        setDisplay(current.toFixed(1));
      } else {
        setDisplay(Math.round(current).toLocaleString());
      }

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        setDisplay(isFloat ? numericPart.toFixed(1) : numericPart.toLocaleString());
        if (hasPercent) setDisplay(prev => prev + '%');
      }
    }

    requestAnimationFrame(tick);
  }

  return (
    <span ref={ref} className={className}>
      {prefix}{display}{suffix}
    </span>
  );
}
