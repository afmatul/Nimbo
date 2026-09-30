'use client';

import { useEffect, useRef, useState } from 'react';

function readFragmentToken(): string | null {
  const raw = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const token = new URLSearchParams(raw).get('token');
  return token === null || token === '' ? null : token;
}

function stripFragment(): void {
  if (window.location.hash === '') return;
  const next = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(null, '', next);
}

interface Flight<T> {
  readonly token: string | null;
  readonly result: Promise<T>;
}

/**
 * Lee `#token` de un enlace de correo, lo borra de la URL y lo resuelve con `resolve` (sin token, `resolve(null)`).
 * Devuelve `null` mientras resuelve. La resolución en curso vive en un `ref` del componente: el segundo montaje de
 * `<StrictMode>` la reutiliza y la petición no se repite. Si la pestaña ya está en la página y llega otro `#token`
 * (`hashchange`), se resuelve ese token nuevo. `resolve` debe ser estable (`useCallback`).
 */
export function useFragmentToken<T>(resolve: (token: string | null) => Promise<T>): T | null {
  const [result, setResult] = useState<T | null>(null);
  const current = useRef<Flight<T> | null>(null);

  useEffect(() => {
    let active = true;

    const follow = (flight: Flight<T>): void => {
      void flight.result.then((next) => {
        if (active && current.current === flight) setResult(() => next);
      });
    };

    const start = (token: string | null): void => {
      stripFragment();
      const flight: Flight<T> = { token, result: resolve(token) };
      current.current = flight;
      follow(flight);
    };

    const onHashChange = (): void => {
      const token = readFragmentToken();
      if (token === null) return;
      if (token === current.current?.token) {
        stripFragment();
        return;
      }
      setResult(null);
      start(token);
    };

    if (current.current === null) start(readFragmentToken());
    else follow(current.current);
    window.addEventListener('hashchange', onHashChange);
    return () => {
      active = false;
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [resolve]);

  return result;
}
