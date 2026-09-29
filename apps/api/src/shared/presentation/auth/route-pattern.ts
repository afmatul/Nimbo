import type { Request } from 'express';

const UNKNOWN_ROUTE = '<sin patrón>';

/**
 * `GET /api/v1/__probe/actor/:id`: el **patrón** de la ruta que atiende la petición, nunca la URL (sin
 * identificadores reales ni consulta), para las bitácoras de autorización (003 §7, CA-16).
 */
export const routePatternOf = (request: Pick<Request, 'method' | 'baseUrl' | 'route'>): string => {
  const path = (request.route as { path?: unknown } | undefined)?.path;
  return typeof path === 'string'
    ? `${request.method} ${request.baseUrl}${path}`
    : `${request.method} ${UNKNOWN_ROUTE}`;
};
