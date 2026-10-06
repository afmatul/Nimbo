import * as React from 'react';

/**
 * Llama a `refresh` cuando cambia `signal` (comparado con `Object.is`) y `enabled` es verdadero. El valor del montaje
 * no cuenta: la primera lectura ya está en curso.
 */
export function useRefreshWhen(enabled: boolean, refresh: () => void, signal: unknown): void {
  const seen = React.useRef(signal);
  React.useEffect(() => {
    if (Object.is(seen.current, signal)) return;
    seen.current = signal;
    if (enabled) refresh();
  }, [enabled, refresh, signal]);
}
