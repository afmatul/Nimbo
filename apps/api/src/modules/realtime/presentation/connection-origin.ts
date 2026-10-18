import type { IncomingHttpHeaders } from 'node:http';

/** Lo que se lee del *handshake* para saber de dónde viene el intento. */
export interface HandshakeSource {
  readonly headers: IncomingHttpHeaders;
  readonly address: string;
}

/**
 * Origen del intento de conexión, clave del límite (CA-14): el último valor de `x-forwarded-for`, que agrega Traefik
 * (un salto, como `trust proxy = 1` en HTTP), o la dirección de la conexión si no pasa por el proxy.
 */
export const connectionOrigin = ({ headers, address }: HandshakeSource): string => {
  const forwarded = headers['x-forwarded-for'];
  const values = Array.isArray(forwarded) ? forwarded.join(',') : (forwarded ?? '');
  const last = values.split(',').at(-1)?.trim() ?? '';
  return last === '' ? address : last;
};
