import { TooManyRequestsError, type DomainError } from '../../../shared';

/** `data` del `connect_error` que recibe el cliente (plan §4). */
export interface HandshakeErrorData {
  readonly code: string;
  readonly status: number;
  readonly retryAfterSeconds?: number;
}

/** Error de *middleware* de Socket.IO: el cliente lo recibe como `connect_error` con `message` y `data`. */
export type HandshakeError = Error & { readonly data: HandshakeErrorData };

/**
 * Convierte el rechazo de `ConnectionAdmission` en el error del *handshake*: `message` es el `code` estable y `data`
 * lleva código, estado HTTP equivalente y, en un 429, la espera (CA-2, CA-3, CA-14).
 */
export const toHandshakeError = (error: DomainError): HandshakeError => {
  const retry =
    error instanceof TooManyRequestsError ? { retryAfterSeconds: error.retryAfterSeconds } : {};
  const data: HandshakeErrorData = { code: error.code, status: error.status, ...retry };
  return Object.assign(new Error(error.code), { data });
};
