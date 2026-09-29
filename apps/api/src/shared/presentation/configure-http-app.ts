import { HttpException, HttpStatus } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { Logger } from 'nestjs-pino';

import type { Env } from '../infrastructure/config/env.schema';
import {
  CORRELATION_ID_HEADER,
  CorrelationIdMiddleware,
} from '../infrastructure/correlation/correlation-id.middleware';

import { DomainExceptionFilter } from './domain-exception.filter';
import { VersionHeaderMiddleware } from './version-header.middleware';

const API_PREFIX = 'api/v1';

/** Un salto: Traefik agrega `X-Forwarded-For` y el puerto de `api` no se publica (plan 001 §6.5). */
const TRUSTED_PROXY_HOPS = 1;
/** Ninguna ruta pública recibe más que un formulario corto (DT-12). */
const JSON_BODY_LIMIT = '16kb';
const CORS_METHODS = ['GET', 'POST'];
const CORS_ALLOWED_HEADERS = ['content-type', CORRELATION_ID_HEADER];
const CORS_EXPOSED_HEADERS = [CORRELATION_ID_HEADER, 'retry-after'];

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
 * Configuración HTTP común de `main.ts` y del arnés de integración (plan 001 §6.7). La app debe crearse con
 * `bodyParser: false`: aquí se instala **solo** el analizador JSON, así un cuerpo `text/plain` o de formulario llega
 * vacío (001 CA-6). El orden importa: correlación y versión antes del analizador, para que sus errores también
 * lleven `x-correlation-id`. `credentials` de CORS lo activa 002 cuando existan cookies.
 */
export const configureHttpApp = (app: NestExpressApplication, env: HttpAppEnv): void => {
  const correlation = new CorrelationIdMiddleware();
  const version = new VersionHeaderMiddleware(env.APP_VERSION);
  app.use(correlation.use.bind(correlation));
  app.use(version.use.bind(version));
  app.set('trust proxy', TRUSTED_PROXY_HOPS);
  app.enableCors({
    origin: env.CORS_ORIGIN,
    methods: CORS_METHODS,
    allowedHeaders: CORS_ALLOWED_HEADERS,
    exposedHeaders: CORS_EXPOSED_HEADERS,
  });
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.use(translateBodyParserError);
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalFilters(new DomainExceptionFilter(app.get(Logger)));
};
