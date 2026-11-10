import { performance } from 'node:perf_hooks';

import type { NextFunction, Request, Response } from 'express';
import { Histogram } from 'prom-client';
import type { Registry } from 'prom-client';

import { routePatternOf } from './auth/route-pattern';

export const HTTP_REQUEST_DURATION_SECONDS = 'nimbo_http_request_duration_seconds';

/** De 5 ms a 10 s, con el 0,3 s del umbral de RNF-01 como borde (022 plan §5). */
const HTTP_DURATION_BUCKETS_SECONDS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.3, 0.5, 1, 2.5, 5, 10];
const MS_PER_SECOND = 1000;
const UNMATCHED_ROUTE = '<sin patrón>';
const WILDCARD = '*';

/**
 * Plantilla de la ruta, o `<sin patrón>` si no hay ninguna. Nest registra su manejador de no encontrados como comodín
 * (`/api/v1{/*splat}`): no es una ruta de la app, así que cuenta como no encontrada.
 */
const routeLabelOf = (request: Request): string => {
  const pattern = routePatternOf(request);
  return pattern.includes(WILDCARD) ? `${request.method} ${UNMATCHED_ROUTE}` : pattern;
};

/**
 * Mide cada petición HTTP por **plantilla de ruta** (CA-5): la etiqueta sale de `routePatternOf` al terminar la
 * respuesta, nunca de la URL real, así que los identificadores, correos y consultas no entran en ninguna serie.
 */
export class HttpMetricsMiddleware {
  private readonly durations: Histogram<'route' | 'status'>;

  constructor(registry: Registry) {
    this.durations = new Histogram({
      name: HTTP_REQUEST_DURATION_SECONDS,
      help: 'Duración de las peticiones HTTP por plantilla de ruta y código',
      labelNames: ['route', 'status'],
      buckets: HTTP_DURATION_BUCKETS_SECONDS,
      registers: [registry],
    });
  }

  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = performance.now();
    response.once('finish', () => {
      this.durations.observe(
        { route: routeLabelOf(request), status: String(response.statusCode) },
        (performance.now() - startedAt) / MS_PER_SECOND,
      );
    });
    next();
  }
}
