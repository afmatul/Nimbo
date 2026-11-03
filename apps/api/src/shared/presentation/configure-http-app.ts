import { HttpException, HttpStatus } from '@nestjs/common';
import type {
  CorsOptions,
  CorsOptionsDelegate,
} from '@nestjs/common/interfaces/external/cors-options.interface';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { Logger } from 'nestjs-pino';
import type { Registry } from 'prom-client';

import type { Env } from '../infrastructure/config/env.schema';
import {
  CORRELATION_ID_HEADER,
  CorrelationIdMiddleware,
} from '../infrastructure/correlation/correlation-id.middleware';
import { METRICS_REGISTRY } from '../infrastructure/metrics/metrics.module';

import { DomainExceptionFilter } from './domain-exception.filter';
import { HttpMetricsMiddleware } from './http-metrics.middleware';
import { VersionHeaderMiddleware } from './version-header.middleware';

const API_PREFIX = 'api/v1';

/** Un salto: Traefik agrega `X-Forwarded-For` y el puerto de `api` no se publica (plan 001 §6.5). */
const TRUSTED_PROXY_HOPS = 1;
/** Ninguna ruta pública recibe más que un formulario corto (DT-12). */
const JSON_BODY_LIMIT = '16kb';
const CORS_METHODS = ['GET', 'POST', 'DELETE'];
const CORS_ALLOWED_HEADERS = ['content-type', CORRELATION_ID_HEADER, 'authorization'];
const CORS_EXPOSED_HEADERS = [CORRELATION_ID_HEADER, 'retry-after'];
/** Sin CORS: el paquete `cors` no escribe ninguna cabecera, ni siquiera `Access-Control-Allow-Credentials`. */
const NO_CORS: CorsOptions = { origin: false };

/**
 * Rutas cuyas respuestas nunca se guardan en caché: las de `auth` (plan 001 §5), las del backoffice, que devuelven
 * correos y nombres de archivo de clientes (011 CA-13), y las del agente, que devuelven respuestas sobre el contenido,
 * citas y nombres de archivo (020 plan §2). Se fija aquí, antes del analizador, para cubrir también su `400` de JSON
 * mal formado; para `auth`, `identity` la vuelve a fijar en sus controladores. En minúsculas: el enrutador de Express
 * no distingue mayúsculas.
 */
const NO_STORE_PATH_PREFIXES = [
  `/${API_PREFIX}/auth/`,
  `/${API_PREFIX}/backoffice/`,
  `/${API_PREFIX}/agent/`,
];

/** Lo único del entorno que la configuración HTTP necesita. */
export type HttpAppEnv = Pick<Env, 'APP_VERSION' | 'CORS_ORIGIN'>;

interface BodyParserError {
  readonly type: string;
  readonly status: number;
}

const isBodyParserError = (error: unknown): error is BodyParserError =>
  typeof error === 'object' &&
  error !== null &&
  typeof (error as Partial<BodyParserError>).type === 'string' &&
  typeof (error as Partial<BodyParserError>).status === 'number';

/**
 * Los errores del analizador (cuerpo demasiado grande, JSON mal formado, codificación no admitida) no son
 * `HttpException`: sin esta traducción `DomainExceptionFilter` los respondería como `500`. Conserva su estado.
 */
const translateBodyParserError = (
  error: unknown,
  _request: Request,
  _response: Response,
  next: NextFunction,
): void => {
  if (isBodyParserError(error) && error.status < (HttpStatus.INTERNAL_SERVER_ERROR as number)) {
    next(new HttpException(error.type, error.status));
    return;
  }
  next(error);
};

/**
 * CORS con credenciales, porque la cookie de refresco viaja entre la web y la API (plan 002 §6.7). Solo responde al
 * origen exacto de la lista `CORS_ORIGIN`, nunca con comodín; un origen no listado no recibe ninguna cabecera CORS.
 */
const corsForOrigins =
  (allowedOrigins: readonly string[]): CorsOptionsDelegate<Request> =>
  (request, callback) => {
    const origin = request.headers.origin;
    if (origin === undefined || !allowedOrigins.includes(origin)) {
      callback(null, NO_CORS);
      return;
    }
    callback(null, {
      origin,
      methods: CORS_METHODS,
      allowedHeaders: CORS_ALLOWED_HEADERS,
      exposedHeaders: CORS_EXPOSED_HEADERS,
      credentials: true,
    });
  };

const noStoreForSensitiveRoutes = (
  request: Request,
  response: Response,
  next: NextFunction,
): void => {
  const path = request.path.toLowerCase();
  if (NO_STORE_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    response.setHeader('Cache-Control', 'no-store');
  }
  next();
};

/**
 * Configuración HTTP común de `main.ts` y del arnés de integración (plan 001 §6.7). La app debe crearse con
 * `bodyParser: false`: aquí se instala **solo** el analizador JSON, así un cuerpo `text/plain` o de formulario llega
 * vacío (001 CA-6). El orden importa: correlación, versión y `no-store` antes del analizador, para que sus
 * errores también lleven `x-correlation-id` y `Cache-Control`. La medición HTTP (022 T-02) va después de la correlación
 * y antes del analizador, para contar también sus `4xx`.
 */
export const configureHttpApp = (app: NestExpressApplication, env: HttpAppEnv): void => {
  const correlation = new CorrelationIdMiddleware();
  const version = new VersionHeaderMiddleware(env.APP_VERSION);
  app.use(correlation.use.bind(correlation));
  app.use(version.use.bind(version));
  const metrics = new HttpMetricsMiddleware(app.get<Registry>(METRICS_REGISTRY));
  app.use(metrics.use.bind(metrics));
  app.use(noStoreForSensitiveRoutes);
  app.set('trust proxy', TRUSTED_PROXY_HOPS);
  app.enableCors(corsForOrigins(env.CORS_ORIGIN));
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.use(translateBodyParserError);
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalFilters(new DomainExceptionFilter(app.get(Logger)));
};
