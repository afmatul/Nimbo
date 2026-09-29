import type { ClientContext } from '../application/client-context';

import { DEVICE_COOKIE, readCookie } from './session-cookies';

/** Lo único que `identity` lee de la petición para abrir o renovar una sesión. */
export interface ClientRequest {
  readonly headers: {
    readonly cookie?: string | undefined;
    readonly 'user-agent'?: string | undefined;
  };
  /** `req.ip` de Express, ya resuelto con `trust proxy` (001). */
  readonly ip?: string | undefined;
}

/**
 * Datos del cliente para `SessionService` (CA-16): la cookie `nimbo_did`, el `User-Agent` (vacío si falta) y la IP.
 * Nada más de la petición.
 */
export const readClientContext = (req: ClientRequest): ClientContext => {
  const deviceSecret = readCookie(req, DEVICE_COOKIE);
  return {
    ...(deviceSecret === undefined ? {} : { deviceSecret }),
    userAgent: req.headers['user-agent'] ?? '',
    ip: req.ip ?? null,
  };
};
