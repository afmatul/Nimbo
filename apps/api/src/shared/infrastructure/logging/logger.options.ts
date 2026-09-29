import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

import type { Params } from 'nestjs-pino';
import { stdSerializers } from 'pino';
import type { DestinationStream, LoggerOptions } from 'pino';
import type { Options as PinoHttpOptions } from 'pino-http';

import { CorrelationContext } from '../correlation/correlation-context';

import { redactDeep, REDACTED_VALUE } from './redact-deep';

export interface LoggerOptionsInput {
  readonly level: string;
  /** Solo pruebas: destino en memoria. Sin él, pino escribe en stdout. */
  readonly stream?: DestinationStream | undefined;
}

/** Cabeceras que pino-http enlaza en `req`/`res`; el `hook` no las ve, así que van por `redact.paths`. */
const REDACTED_HEADER_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

const correlationFields = (): Record<string, string> => {
  const store = CorrelationContext.get();
  if (store === undefined) {
    return {};
  }
  return store.jobId === undefined
    ? { correlationId: store.correlationId }
    : { correlationId: store.correlationId, jobId: store.jobId };
};

const stripQuery = (url: string): string => url.split('?')[0] ?? '';

/** Opciones de pino (api y worker): `mixin` de correlación, redacción profunda y de cabeceras. */
export const buildPinoOptions = (input: LoggerOptionsInput): LoggerOptions => ({
  level: input.level,
  mixin: correlationFields,
  redact: { paths: REDACTED_HEADER_PATHS, censor: REDACTED_VALUE },
  hooks: {
    logMethod(args, method) {
      const [first, ...rest] = args;
      if (typeof first === 'object' && first !== null) {
        method.apply(this, [redactDeep(first), ...rest] as Parameters<typeof method>);
        return;
      }
      method.apply(this, args);
    },
  },
});

/** Parámetros de `LoggerModule.forRoot` (nestjs-pino): pino + pino-http con `correlationId` (CA-13). */
export const buildLoggerModuleParams = (input: LoggerOptionsInput): Params => {
  const options = buildPinoHttpOptions(input);
  return { pinoHttp: input.stream === undefined ? options : [options, input.stream] };
};

/** Con `quietResLogger`, pino-http ya no enlaza `req` a la línea de cierre: se agrega aquí, solo a ella. */
const withRequest = (req: IncomingMessage, _res: unknown, loggable: object): object => ({
  ...loggable,
  req,
});

const buildPinoHttpOptions = (input: LoggerOptionsInput): PinoHttpOptions => ({
  ...buildPinoOptions(input),
  // `req` y `res` (cabeceras, IP) van solo en la línea `http.request`: los *loggers* de la petición que usan los
  // servicios (vía `PinoLogger`) enlazan únicamente `reqId`, igual al `correlationId` (plan §7, CA-18).
  quietReqLogger: true,
  quietResLogger: true,
  customSuccessObject: withRequest,
  customErrorObject: (req, res, _error, loggable): object => withRequest(req, res, loggable),
  genReqId: (): string => CorrelationContext.get()?.correlationId ?? randomUUID(),
  // El `correlationId` ya lo pone el `mixin` en todas las líneas, incluida esta.
  customProps: (): Record<string, unknown> => ({ event: 'http.request' }),
  serializers: {
    // `http.request` va sin cuerpo ni cadena de consulta (plan §7): la URL puede llevar claves de enlace.
    req: (req: IncomingMessage): Omit<ReturnType<typeof stdSerializers.req>, 'query'> => {
      const { query: _query, ...serialized } = stdSerializers.req(req);
      return { ...serialized, url: stripQuery(serialized.url) };
    },
  },
});
