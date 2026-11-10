import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { collectDefaultMetrics, Registry } from 'prom-client';

import { errorClassOf } from '../../application/error-class';

/** Registro propio de la aplicación: no hay registro global compartido entre pruebas (022 plan §2). */
export const METRICS_REGISTRY = Symbol('METRICS_REGISTRY');

/** Ruta del formato de texto de Prometheus, fuera de `/api/v1` (CA-2). */
const METRICS_PATH = '/metrics';
const NOT_FOUND = 404;
const INTERNAL_ERROR = 500;
const OK = 200;

export const createMetricsRegistry = (): Registry => new Registry();

/**
 * Métricas de proceso (`process_*`, `nodejs_*`), en un registro **único por proceso**: cada `collectDefaultMetrics`
 * deja un monitor de latencia del bucle de eventos que nunca se detiene, así que uno por aplicación se acumularía en
 * las pruebas. Se fusionan con el registro de la aplicación al responder `/metrics`.
 */
let processRegistry: Registry | undefined;
const processMetricsRegistry = (): Registry => {
  if (processRegistry === undefined) {
    processRegistry = new Registry();
    collectDefaultMetrics({ register: processRegistry });
  }
  return processRegistry;
};

/** Registro propio de la aplicación. `SharedModule` lo importa, así que llega a `api`, `worker` y `worker-optimizer`. */
@Module({
  providers: [{ provide: METRICS_REGISTRY, useFactory: createMetricsRegistry }],
  exports: [METRICS_REGISTRY],
})
export class MetricsModule {}

const pathOf = (request: IncomingMessage): string =>
  new URL(request.url ?? '/', 'http://localhost').pathname;

/**
 * Responde `/metrics` con el texto de exposición. Un fallo al recolectar se registra y responde `500`: nunca tumba el
 * proceso ni bloquea sus peticiones (RN-6).
 */
const sendMetrics =
  (registry: Registry, logger: Logger) =>
  async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (request.method !== 'GET' || pathOf(request) !== METRICS_PATH) {
      response.writeHead(NOT_FOUND).end();
      return;
    }
    try {
      const exposition = Registry.merge([registry, processMetricsRegistry()]);
      const body = await exposition.metrics();
      response.writeHead(OK, { 'Content-Type': exposition.contentType });
      response.end(body);
    } catch (error) {
      logger.error(
        { event: 'metrics.collect_failed', errorClass: errorClassOf(error) },
        'No se pudieron recolectar las métricas',
      );
      response.writeHead(INTERNAL_ERROR).end();
    }
  };

/**
 * Expone `/metrics` en el puerto interno de salud de un `worker` (022 plan §2). Se monta en la misma app que sirve la
 * salud: nunca se publica (CA-23) y no lleva el prefijo `/api/v1`. Llamarla antes de `listen`.
 */
export const attachMetricsRoute = (app: INestApplication): void => {
  const handler = sendMetrics(app.get<Registry>(METRICS_REGISTRY), app.get(Logger));
  app.getHttpAdapter().get(METRICS_PATH, handler);
};

/**
 * Servidor privado del `api` (022 plan §2, CA-2): escucha en `METRICS_PORT` en todas las interfaces, fuera de
 * `/api/v1` y de Traefik. Un fallo al escuchar se registra y no tumba el proceso: el `api` sigue sirviendo (RN-6).
 */
export const startMetricsServer = (app: INestApplication, port: number): Server => {
  const logger = app.get(Logger);
  const server = createServer(sendMetrics(app.get<Registry>(METRICS_REGISTRY), logger));
  server.on('error', (error: unknown) => {
    logger.error(
      { event: 'metrics.server_failed', errorClass: errorClassOf(error) },
      'El servidor de métricas no pudo escuchar',
    );
  });
  server.listen(port);
  return server;
};
