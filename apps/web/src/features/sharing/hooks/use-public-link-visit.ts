'use client';

import { SHARED_ERROR_CODES, SHARING_ERROR_CODES, type PublicLinkDetails } from '@nimbo/contracts';
import { useCallback, useEffect, useState } from 'react';

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
  /** «Descargar»; sin contraseña, `''`, que el cliente no envía. `false` si ya había una en curso. */
  readonly download: (password?: string) => Promise<boolean>;
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

interface OpenRequest {
  readonly token: string;
}

/** El pedido del fragmento con su ficha y su aviso: otro pedido los vuelve a `loading` e `idle` (CA-8). */
interface VisitSnapshot {
  readonly request: OpenRequest | null;
  readonly state: PublicLinkVisitState;
  readonly outcome: PublicLinkDownloadOutcome;
}

type VisitChange = Partial<Pick<VisitSnapshot, 'state' | 'outcome'>>;

const FIRST_VISIT: VisitSnapshot = { request: null, state: LOADING, outcome: IDLE };

const freshVisit = (token: string): VisitSnapshot => ({
  request: { token },
  state: LOADING,
  outcome: IDLE,
});

interface VisitRequest {
  readonly snapshot: VisitSnapshot;
  readonly reload: () => void;
  /** Cambia la ficha o el aviso solo si su pedido sigue vigente: una respuesta vieja no pisa al pedido actual. */
  readonly change: (change: VisitChange) => void;
}

/**
 * El `#token` de la barra: se lee al montar y con `hashchange` si cambió; «Reintentar» pide el mismo de nuevo. Cada
 * pedido es un objeto nuevo y deja sin efecto lo que llegue del anterior.
 */
function useVisitRequest(): VisitRequest {
  const [snapshot, setSnapshot] = useState(FIRST_VISIT);
  useEffect(() => {
    const follow = (): void => {
      const token = readFragment();
      setSnapshot((current) => (current.request?.token === token ? current : freshVisit(token)));
    };
    follow();
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);
  const reload = useCallback(() => setSnapshot(freshVisit(readFragment())), []);
  const { request } = snapshot;
  const change = useCallback(
    (next: VisitChange) =>
      setSnapshot((current) => (current.request === request ? { ...current, ...next } : current)),
    [request],
  );
  return { snapshot, reload, change };
}

/**
 * `POST /open` por cada pedido; al desmontar o con otro pedido, el resultado anterior ya no se aplica. El pedido llega
 * después de montar, así el doble montaje de `<StrictMode>` no repite la petición (CA-8).
 */
function useOpenDetails(
  api: PublicLinkVisitorApi,
  request: OpenRequest | null,
  setState: (state: PublicLinkVisitState) => void,
): void {
  useEffect(() => {
    if (request === null) return undefined;
    let current = true;
    void openState(api, request.token).then((next) => {
      if (current) setState(next);
    });
    return () => {
      current = false;
    };
  }, [api, request, setState]);
}

interface VisitDownloadInput {
  readonly api: PublicLinkVisitorApi;
  readonly openUrl: (url: string) => void;
  readonly token: string;
  readonly setState: (state: PublicLinkVisitState) => void;
  readonly setOutcome: (outcome: PublicLinkDownloadOutcome) => void;
}

/** Limpia el aviso anterior al pedir la URL; un `404` deja la página sin ficha (CA-6) y el resto, un aviso. */
function useVisitDownload({
  api,
  openUrl,
  token,
  setState,
  setOutcome,
}: VisitDownloadInput): PreparingDownload<string> {
  return usePreparingDownload<string>(
    (password) => {
      setOutcome(IDLE);
      return api.download(token, password);
    },
    (_password, error, retry) => {
      if (isUnavailable(error)) setState(UNAVAILABLE);
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
  const { snapshot, reload, change } = useVisitRequest();
  const { request } = snapshot;
  const setState = useCallback((state: PublicLinkVisitState) => change({ state }), [change]);
  const setOutcome = useCallback(
    (outcome: PublicLinkDownloadOutcome) => change({ outcome }),
    [change],
  );
  useOpenDetails(api, request, setState);
  const token = request?.token ?? '';
  const prepared = useVisitDownload({ api, openUrl, token, setState, setOutcome });

  return {
    state: snapshot.state,
    outcome: snapshot.outcome,
    preparing: prepared.preparing !== null,
    reload,
    download: (password = '') => prepared.download(password),
  };
}
