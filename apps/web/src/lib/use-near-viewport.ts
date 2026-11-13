'use client';

import * as React from 'react';

/**
 * Verdadero cuando el elemento entra (o está por entrar) en pantalla; una sola vez. Sin `IntersectionObserver`, nunca.
 * Sirve para cargar lo costoso (miniaturas, estados) solo de las tarjetas que se ven.
 */
export function useNearViewport(element: HTMLElement | null): boolean {
  const [near, setNear] = React.useState(false);
  React.useEffect(() => {
    if (element === null || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setNear(true);
        observer.disconnect();
      },
      { rootMargin: '150px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return near;
}
