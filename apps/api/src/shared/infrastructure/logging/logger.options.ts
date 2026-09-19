import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

import type { Params } from 'nestjs-pino';
import { stdSerializers } from 'pino';
import type { LoggerOptions } from 'pino';

import { CorrelationContext } from '../correlation/correlation-context';

import { redactDeep, REDACTED_VALUE } from './redact-deep';

export interface LoggerOptionsInput {
  readonly level: string;
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
export const buildLoggerModuleParams = (input: LoggerOptionsInput): Params => ({
  pinoHttp: {
    ...buildPinoOptions(input),
    genReqId: (): string => CorrelationContext.get()?.correlationId ?? randomUUID(),
    customProps: (): Record<string, unknown> => ({ event: 'http.request', ...correlationFields() }),
    serializers: {
      // `http.request` va sin cuerpo ni cadena de consulta (plan §7): la URL puede llevar claves de enlace.
      req: (req: IncomingMessage): ReturnType<typeof stdSerializers.req> => {
        const serialized = stdSerializers.req(req);
        return { ...serialized, url: stripQuery(serialized.url) };
      },
    },
  },
});
