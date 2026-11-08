'use client';

import { SHARED_ERROR_CODES, SHARING_ERROR_CODES, type PublicLinkDetails } from '@nimbo/contracts';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { ApiClientError } from '../../../lib/api-error';
import { usePreparingDownload, type PreparingDownload } from '../../../lib/use-preparing-download';
import type { PublicLinkVisitorApi } from '../public-link-visitor-api';

/** Lo que muestra la página según el `POST /open` (013b §6). */
export type PublicLinkVisitState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly details: PublicLinkDetails }
  | { readonly status: 'unavailable' }
  | { readonly status: 'rate-limited'; readonly retryAfterSeconds: number | undefined }
  | { readonly status: 'load-error' };

/** Cómo terminó el último «Descargar»; la ficha sigue visible en todos (CA-3 a CA-5, CA-7). */
export type PublicLinkDownloadOutcome =
  | { readonly status: 'idle' }
  | { readonly status: 'started' }
  | { readonly status: 'password-invalid' }
  | { readonly status: 'rate-limited'; readonly retryAfterSeconds: number | undefined }
  | { readonly status: 'download-error'; readonly retry: () => void };

export interface PublicLinkVisit {
  readonly state: PublicLinkVisitState;
  readonly outcome: PublicLinkDownloadOutcome;
  /** La URL tarda más de 2 s: «Preparando descarga…» y no acepta otro clic (CA-3). */
  readonly preparing: boolean;
  /** «Reintentar» al abrir (CA-5, CA-7): vuelve a pedir la ficha del fragmento actual. */
  readonly reload: () => void;
  /** «Descargar»; sin contraseña, `''`, que el cliente no envía. */
  readonly download: (password?: string) => Promise<void>;
}

const LOADING: PublicLinkVisitState = { status: 'loading' };
const UNAVAILABLE: PublicLinkVisitState = { status: 'unavailable' };
const LOAD_ERROR: PublicLinkVisitState = { status: 'load-error' };
const IDLE: PublicLinkDownloadOutcome = { status: 'idle' };
const STARTED: PublicLinkDownloadOutcome = { status: 'started' };
const PASSWORD_INVALID: PublicLinkDownloadOutcome = { status: 'password-invalid' };

/** El token es el fragmento crudo (`…/enlace#<token>`); se queda en la barra para que recargar funcione (S-1). */
const readFragment = (): string => window.location.hash.replace(/^#/, '');

const hasCode = (error: unknown, code: string): error is ApiClientError =>
  error instanceof ApiClientError && error.code === code;

const isUnavailable = (error: unknown): boolean =>
  hasCode(error, SHARING_ERROR_CODES.SHARING_LINK_UNAVAILABLE);

function failedOpenState(error: unknown): PublicLinkVisitState {
  if (isUnavailable(error)) return UNAVAILABLE;
  if (hasCode(error, SHARED_ERROR_CODES.TOO_MANY_REQUESTS)) {
    return { status: 'rate-limited', retryAfterSeconds: error.retryAfterSeconds };
  }
  return LOAD_ERROR;
}

/** Fragmento vacío → no disponible sin llamar a la API (CA-6). */
async function openState(api: PublicLinkVisitorApi, token: string): Promise<PublicLinkVisitState> {
  if (token === '') return UNAVAILABLE;
  try {
    return { status: 'ready', details: await api.open(token) };
  } catch (error) {
    return failedOpenState(error);
  }
}

function failedDownloadOutcome(error: unknown, retry: () => void): PublicLinkDownloadOutcome {
  if (hasCode(error, SHARING_ERROR_CODES.SHARING_LINK_PASSWORD_INVALID)) return PASSWORD_INVALID;
  if (hasCode(error, SHARED_ERROR_CODES.TOO_MANY_REQUESTS)) {
    return { status: 'rate-limited', retryAfterSeconds: error.retryAfterSeconds };
  }
  return { status: 'download-error', retry };
}

interface OpenFlight {
  readonly token: string;
  readonly result: Promise<PublicLinkVisitState>;
}

interface OpenVisit {
  readonly state: PublicLinkVisitState;
  readonly reload: () => void;
  readonly markUnavailable: () => void;
  /** Token de la ficha abierta; se lee al descargar, nunca al pintar. */
  readonly currentToken: () => string;
}

/** Peticiones `POST /open`: la que está en curso y si el componente sigue montado. */
interface OpenFlights {
  readonly flightRef: RefObject<OpenFlight | null>;
  readonly mountedRef: RefObject<boolean>;
  /** Aplica el resultado si sigue montado y nadie abrió otro token después. */
  readonly follow: (next: OpenFlight) => void;
  readonly start: (token: string) => void;
}

function useOpenFlights(
  api: PublicLinkVisitorApi,
  setState: (state: PublicLinkVisitState) => void,
): OpenFlights {
  const flightRef = useRef<OpenFlight | null>(null);
  const mountedRef = useRef(false);

  const follow = useCallback(
    (next: OpenFlight): void => {
      void next.result.then((result) => {
        if (mountedRef.current && flightRef.current === next) setState(result);
      });
    },
    [setState],
  );

  const start = useCallback(
    (token: string): void => {
      flightRef.current = { token, result: openState(api, token) };
      follow(flightRef.current);
    },
    [api, follow],
  );

  return { flightRef, mountedRef, follow, start };
}

/**
 * Al montar abre el fragmento o, en el segundo montaje de `<StrictMode>`, sigue la petición en curso sin repetirla.
 * Otro `#token` en la misma pestaña (`hashchange`) se abre con `restart`.
 */
function useFragment(flights: OpenFlights, restart: (token: string) => void): void {
  const { flightRef, mountedRef, follow, start } = flights;
  useEffect(() => {
    mountedRef.current = true;
    if (flightRef.current === null) start(readFragment());
    else follow(flightRef.current);

    const onHashChange = (): void => {
      const token = readFragment();
      if (token !== flightRef.current?.token) restart(token);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => {
      mountedRef.current = false;
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [flightRef, mountedRef, start, follow, restart]);
}

/** `POST /open` con el token del fragmento; la petición en curso vive en un `ref` (`useOpenFlights`). */
function useOpenVisit(api: PublicLinkVisitorApi, onRestart: () => void): OpenVisit {
  const [state, setState] = useState<PublicLinkVisitState>(LOADING);
  const flights = useOpenFlights(api, setState);
  const { start, flightRef } = flights;

  const restart = useCallback(
    (token: string): void => {
      setState(LOADING);
      onRestart();
      start(token);
    },
    [onRestart, start],
  );

  useFragment(flights, restart);

  return {
    state,
    reload: () => restart(readFragment()),
    markUnavailable: () => setState(UNAVAILABLE),
    currentToken: () => flightRef.current?.token ?? '',
  };
}

interface VisitDownloadInput {
  readonly api: PublicLinkVisitorApi;
  readonly openUrl: (url: string) => void;
  readonly visit: OpenVisit;
  readonly setOutcome: (outcome: PublicLinkDownloadOutcome) => void;
}

/** Limpia el aviso anterior al pedir la URL; un `404` deja la página sin ficha (CA-6) y el resto, un aviso. */
function useVisitDownload({
  api,
  openUrl,
  visit,
  setOutcome,
}: VisitDownloadInput): PreparingDownload<string> {
  return usePreparingDownload<string>(
    (password) => {
      setOutcome(IDLE);
      return api.download(visit.currentToken(), password);
    },
    (_password, error, retry) => {
      if (isUnavailable(error)) visit.markUnavailable();
      else setOutcome(failedDownloadOutcome(error, retry));
    },
    (url) => {
      openUrl(url);
      setOutcome(STARTED);
    },
  );
}

/**
 * Estado de la visita a `/enlace#<token>` (013b CA-3, CA-5 a CA-8): la ficha y la descarga con el patrón de 005
 * («Preparando…» pasados 2 s, una petición a la vez). No guarda nada en el navegador y nunca registra el token.
 */
export function usePublicLinkVisit(
  api: PublicLinkVisitorApi,
  openUrl: (url: string) => void,
): PublicLinkVisit {
  const [outcome, setOutcome] = useState<PublicLinkDownloadOutcome>(IDLE);
  const resetOutcome = useCallback(() => setOutcome(IDLE), []);
  const visit = useOpenVisit(api, resetOutcome);
  const prepared = useVisitDownload({ api, openUrl, visit, setOutcome });

  return {
    state: visit.state,
    outcome,
    preparing: prepared.preparing !== null,
    reload: visit.reload,
    download: async (password = '') => {
      await prepared.download(password);
    },
  };
}
