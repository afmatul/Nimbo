'use client';

import { SHARED_ERROR_CODES, SHARING_ERROR_CODES, type PublicLinkDetails } from '@nimbo/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiClientError } from '../../../lib/api-error';
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

/** Un pedido de la ficha: cada lectura del fragmento o «Reintentar» lleva el número siguiente (PD-200). */
export interface VisitRequest {
  readonly number: number;
  readonly token: string;
}

export interface PublicLinkVisit {
  readonly state: PublicLinkVisitState;
  /** El pedido vigente; `null` hasta leer el fragmento al montar. */
  readonly request: VisitRequest | null;
  /** «Reintentar» al abrir (CA-5, CA-7): vuelve a pedir la ficha del fragmento actual. */
  readonly reload: () => void;
  /** `true` si el pedido con ese número sigue vigente: lo que llegue de uno viejo se descarta (PD-200). */
  readonly isCurrent: (requestNumber: number) => boolean;
  /** Un `404` al descargar deja la página sin ficha (CA-6), solo si su pedido sigue vigente. */
  readonly markUnavailable: (requestNumber: number) => void;
}

const LOADING: PublicLinkVisitState = { status: 'loading' };
const UNAVAILABLE: PublicLinkVisitState = { status: 'unavailable' };
const LOAD_ERROR: PublicLinkVisitState = { status: 'load-error' };

/** El token es el fragmento crudo (`…/enlace#<token>`); se queda en la barra para que recargar funcione (S-1). */
const readFragment = (): string => window.location.hash.replace(/^#/, '');

export const hasCode = (error: unknown, code: string): error is ApiClientError =>
  error instanceof ApiClientError && error.code === code;

export const isUnavailable = (error: unknown): boolean =>
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

/** El pedido del fragmento con su ficha: otro pedido la vuelve a `loading` (CA-8). */
interface VisitSnapshot {
  readonly request: VisitRequest | null;
  readonly state: PublicLinkVisitState;
}

const FIRST_VISIT: VisitSnapshot = { request: null, state: LOADING };

interface VisitRequests {
  readonly snapshot: VisitSnapshot;
  readonly reload: () => void;
  readonly isCurrent: (requestNumber: number) => boolean;
  /** Cambia la ficha solo si su pedido sigue vigente: una respuesta vieja no pisa al pedido actual. */
  readonly setStateOf: (requestNumber: number, state: PublicLinkVisitState) => void;
}

/**
 * El `#token` de la barra: se lee al montar y con `hashchange` si cambió; «Reintentar» pide el mismo de nuevo. Cada
 * pedido lleva el número siguiente y deja sin efecto lo que llegue del anterior (PD-200).
 */
function useVisitRequests(): VisitRequests {
  const [snapshot, setSnapshot] = useState(FIRST_VISIT);
  const current = useRef<VisitRequest | null>(null);
  const start = useCallback((token: string) => {
    const request = { number: (current.current?.number ?? 0) + 1, token };
    current.current = request;
    setSnapshot({ request, state: LOADING });
  }, []);
  useEffect(() => {
    const follow = (): void => {
      const token = readFragment();
      if (current.current?.token !== token) start(token);
    };
    follow();
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, [start]);
  const reload = useCallback(() => start(readFragment()), [start]);
  const isCurrent = useCallback((n: number) => current.current?.number === n, []);
  const setStateOf = useCallback((n: number, state: PublicLinkVisitState) => {
    setSnapshot((now) => (now.request?.number === n ? { ...now, state } : now));
  }, []);
  return { snapshot, reload, isCurrent, setStateOf };
}

/**
 * `POST /open` por cada pedido; al desmontar o con otro pedido, el resultado anterior ya no se aplica. El pedido llega
 * después de montar, así el doble montaje de `<StrictMode>` no repite la petición (CA-8).
 */
function useOpenDetails(
  api: PublicLinkVisitorApi,
  request: VisitRequest | null,
  setStateOf: VisitRequests['setStateOf'],
): void {
  useEffect(() => {
    if (request === null) return undefined;
    let current = true;
    void openState(api, request.token).then((next) => {
      if (current) setStateOf(request.number, next);
    });
    return () => {
      current = false;
    };
  }, [api, request, setStateOf]);
}

/**
 * Estado de la visita a `/enlace#<token>` (013b CA-1, CA-5 a CA-8): la ficha del pedido vigente; la descarga va en
 * `usePublicLinkDownload`. No guarda nada en el navegador y nunca registra el token.
 */
export function usePublicLinkVisit(api: PublicLinkVisitorApi): PublicLinkVisit {
  const { snapshot, reload, isCurrent, setStateOf } = useVisitRequests();
  const { request } = snapshot;
  useOpenDetails(api, request, setStateOf);
  const markUnavailable = useCallback((n: number) => setStateOf(n, UNAVAILABLE), [setStateOf]);
  return { state: snapshot.state, request, reload, isCurrent, markUnavailable };
}
