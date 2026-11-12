'use client';

import { SHARED_ERROR_CODES, SHARING_ERROR_CODES } from '@nimbo/contracts';
import { useRef, useState } from 'react';

import { usePreparingDownload, type PreparingDownload } from '../../../lib/use-preparing-download';
import type { PublicLinkVisitorApi } from '../public-link-visitor-api';

import {
  hasCode,
  isUnavailable,
  type PublicLinkDownloadOutcome,
  type PublicLinkVisit,
} from './use-public-link-visit';

export interface PublicLinkDownload {
  readonly outcome: PublicLinkDownloadOutcome;
  /** La URL tarda más de 2 s: «Preparando descarga…» y no acepta otro clic (CA-3). */
  readonly preparing: boolean;
  /** «Descargar»; sin contraseña, `''`, que el cliente no envía. `false` si ya había una en curso. */
  readonly download: (password?: string) => Promise<boolean>;
}

export interface PublicLinkDownloadInput {
  readonly api: PublicLinkVisitorApi;
  readonly openUrl: (url: string) => void;
  readonly visit: PublicLinkVisit;
}

/** Una descarga atada al pedido del fragmento en que se pidió (PD-200). */
interface DownloadRequest {
  readonly requestNumber: number;
  readonly token: string;
  readonly password: string;
}

/** El último resultado con el pedido al que pertenece: el de un pedido viejo no se muestra. */
interface DownloadResult {
  readonly requestNumber: number;
  readonly outcome: PublicLinkDownloadOutcome;
}

const IDLE: PublicLinkDownloadOutcome = { status: 'idle' };
const STARTED: PublicLinkDownloadOutcome = { status: 'started' };
const PASSWORD_INVALID: PublicLinkDownloadOutcome = { status: 'password-invalid' };

function failedDownloadOutcome(error: unknown, retry: () => void): PublicLinkDownloadOutcome {
  if (hasCode(error, SHARING_ERROR_CODES.SHARING_LINK_PASSWORD_INVALID)) return PASSWORD_INVALID;
  if (hasCode(error, SHARED_ERROR_CODES.TOO_MANY_REQUESTS)) {
    return { status: 'rate-limited', retryAfterSeconds: error.retryAfterSeconds };
  }
  return { status: 'download-error', retry };
}

/**
 * El patrón de 005 con la guardia por pedido: limpia el aviso al pedir la URL; si el pedido ya no es el vigente, su
 * URL no se abre y su fallo no cambia nada. Un `404` deja la página sin ficha (CA-6) y el resto, un aviso.
 */
function useGuardedDownload(
  { api, openUrl, visit }: PublicLinkDownloadInput,
  setResult: (result: DownloadResult | null) => void,
): PreparingDownload<DownloadRequest> {
  const asked = useRef(0);
  return usePreparingDownload<DownloadRequest>(
    ({ requestNumber, token, password }) => {
      asked.current = requestNumber;
      setResult(null);
      return api.download(token, password);
    },
    ({ requestNumber }, error, retry) => {
      if (!visit.isCurrent(requestNumber)) return;
      if (isUnavailable(error)) visit.markUnavailable(requestNumber);
      else setResult({ requestNumber, outcome: failedDownloadOutcome(error, retry) });
    },
    (url) => {
      if (!visit.isCurrent(asked.current)) return;
      openUrl(url);
      setResult({ requestNumber: asked.current, outcome: STARTED });
    },
  );
}

/**
 * «Descargar» en la ficha de `/enlace#<token>` (013b CA-3 a CA-7, 013c CA-18): una petición a la vez, «Preparando…»
 * pasados 2 s y solo lo del pedido vigente. La ficha se monta con `key` = número de pedido, así la de otro enlace
 * no espera a la descarga del anterior. No guarda nada en el navegador y nunca registra el token.
 */
export function usePublicLinkDownload(input: PublicLinkDownloadInput): PublicLinkDownload {
  const [result, setResult] = useState<DownloadResult | null>(null);
  const prepared = useGuardedDownload(input, setResult);
  const { request } = input.visit;
  const isOfRequest = (owner: { readonly requestNumber: number }): boolean =>
    owner.requestNumber === request?.number;
  return {
    outcome: result !== null && isOfRequest(result) ? result.outcome : IDLE,
    preparing: prepared.preparing !== null && isOfRequest(prepared.preparing),
    download: (password = '') =>
      request === null
        ? Promise.resolve(false)
        : prepared.download({ requestNumber: request.number, token: request.token, password }),
  };
}
