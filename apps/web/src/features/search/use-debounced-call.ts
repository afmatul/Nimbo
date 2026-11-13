'use client';

import * as React from 'react';

/** Espera sin teclear antes de buscar mientras se escribe (pedido de Adrián, 2026-11-13). */
export const SEARCH_TYPING_DELAY_MS = 300;

export interface DebouncedCall<T> {
  /** Programa `callback(value)`; una llamada nueva antes de `delayMs` reemplaza a la anterior. */
  readonly schedule: (value: T) => void;
  /** Descarta la llamada pendiente (p. ej. al enviar el formulario). */
  readonly cancel: () => void;
}

/** Llama a `callback` con el último valor cuando pasan `delayMs` sin otra llamada; al desmontar se descarta. */
export function useDebouncedCall<T>(
  callback: (value: T) => void,
  delayMs: number,
): DebouncedCall<T> {
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = React.useRef(callback);
  React.useEffect(() => {
    latest.current = callback;
  }, [callback]);
  const cancel = React.useCallback(() => clearTimeout(timer.current), []);
  const schedule = React.useCallback(
    (value: T) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => latest.current(value), delayMs);
    },
    [delayMs],
  );
  React.useEffect(() => cancel, [cancel]);
  return { schedule, cancel };
}
