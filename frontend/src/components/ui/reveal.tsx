'use client';

import { useEffect, useRef, useState, ElementType, PropsWithChildren } from 'react';
import { cn } from '@/lib/utils';

type RevealProps = PropsWithChildren<{
  as?: ElementType;
  className?: string;
  delay?: number;
}>;

/**
 * Lightweight intersection-based reveal for scroll-in animations.
 */
export function Reveal({ as: Component = 'div', className, delay = 0, children }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.16 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Component
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        'transition-all duration-700 ease-out will-change-transform',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6',
        className
      )}
    >
      {children}
    </Component>
  );
}
