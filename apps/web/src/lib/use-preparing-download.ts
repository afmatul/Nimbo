'use client';

import * as React from 'react';

/** Pasado este tiempo sin URL, la descarga muestra «Preparando…» (RNF-14). */
export const PREPARING_DELAY_MS = 2_000;

/** Abre la URL firmada en la pestaña: el navegador descarga (005 CA-13). */
export const openInBrowser = (url: string): void => window.location.assign(url);

export interface PreparingDownload<T> {
  /** Lo que se descarga cuando la URL tarda más de `PREPARING_DELAY_MS`; si no, `null`. */
  readonly preparing: T | null;
  /** `true` si arrancó; `false` si ya había una petición en curso y no hizo nada. */
  readonly download: (arg: T) => Promise<boolean>;
}

/**
 * Descarga con el patrón de 005: una petición a la vez, «Preparando…» pasados 2 s y la URL firmada abierta con
 * `openUrl`. Si falla, `onFailure` decide el aviso y recibe cómo reintentar.
 */
export function usePreparingDownload<T>(
  requestUrl: (arg: T) => Promise<{ readonly url: string }>,
  onFailure: (arg: T, error: unknown, retry: () => void) => void,
  openUrl: (url: string) => void,
): PreparingDownload<T> {
  const [preparing, setPreparing] = React.useState<T | null>(null);
  const inFlight = React.useRef(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => () => clearTimeout(timer.current), []);

  const download = async (arg: T): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    timer.current = setTimeout(() => setPreparing(() => arg), PREPARING_DELAY_MS);
    try {
      openUrl((await requestUrl(arg)).url);
    } catch (error) {
      onFailure(arg, error, () => void download(arg));
    } finally {
      clearTimeout(timer.current);
      inFlight.current = false;
      setPreparing(null);
    }
    return true;
  };

  return { preparing, download };
}
