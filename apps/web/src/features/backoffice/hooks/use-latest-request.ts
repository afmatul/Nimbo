'use client';

import { SHARED_ERROR_CODES } from '@nimbo/contracts';
import * as React from 'react';

import { ApiClientError } from '../../../lib/api-error';

/** Lo que dejó una petición: su respuesta o el motivo del rechazo. */
export type RequestOutcome<Res> =
  { readonly ok: true; readonly value: Res } | { readonly ok: false; readonly error: unknown };

export interface LatestRequest<Req, Res, S> {
  /** Debe ser estable entre renders: cada referencia nueva vuelve a pedir. */
  readonly load: (request: Req) => Promise<Res>;
  /** `null`: nada que pedir. Cada objeto nuevo es una petición nueva (así «Reintentar» repite la misma). */
  readonly request: Req | null;
  /** Estado que deja cada respuesta; una función de módulo (estable). */
  readonly toState: (outcome: RequestOutcome<Res>, request: Req) => S;
  readonly setState: React.Dispatch<React.SetStateAction<S>>;
}

/**
 * Pide cada petición nueva y guarda el estado que deja; la respuesta de una petición anterior (o ya descartada) se
 * ignora. Lo comparten los metadatos de un cliente, la lista de cuentas y la ficha (011, regla de tres).
 */
export function useLatestRequest<Req, Res, S>({
  load,
  request,
  toState,
  setState,
}: LatestRequest<Req, Res, S>): void {
  React.useEffect(() => {
    if (request === null) return undefined;
    let current = true;
    const settle = (outcome: RequestOutcome<Res>): void => {
      if (current) setState(toState(outcome, request));
    };
    load(request).then(
      (value) => settle({ ok: true, value }),
      (error: unknown) => settle({ ok: false, error }),
    );
    return () => {
      current = false;
    };
  }, [load, request, toState, setState]);
}

/** El rechazo es un error HTTP con ese `code`. */
export function hasErrorCode(caught: unknown, code: string): boolean {
  return caught instanceof ApiClientError && caught.code === code;
}

/** `403 SHARED_FORBIDDEN` (CA-14): la pantalla común «sin permiso», no un estado de la pantalla. */
export const isForbidden = (caught: unknown): boolean =>
  hasErrorCode(caught, SHARED_ERROR_CODES.FORBIDDEN);
