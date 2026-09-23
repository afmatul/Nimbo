import type { IncomingMessage } from 'node:http';

import { pino } from 'pino';

import { CorrelationContext } from '../correlation/correlation-context';

import { buildLoggerModuleParams, buildPinoOptions } from './logger.options';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Destino en memoria: cada línea JSON escrita por pino queda disponible ya parseada. */
const memorySink = (): {
  lines: () => Record<string, unknown>[];
  write: (line: string) => void;
} => {
  const written: string[] = [];
  return {
    write: (line: string): void => {
      written.push(line);
    },
    lines: (): Record<string, unknown>[] =>
      written.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
};

const at = (value: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>((current, key) => (current as Record<string, unknown>)[key], value);

describe('buildPinoOptions', () => {
  it('CA-13: cada línea lleva el `correlationId` (y `jobId`) del `CorrelationContext` activo por `mixin`', () => {
    const sink = memorySink();
    const logger = pino(buildPinoOptions({ level: 'info' }), sink);

    CorrelationContext.run({ correlationId: 'corr-1', jobId: 'job-9' }, () => {
      logger.info({ event: 'job.started' }, 'Trabajo iniciado');
    });

    expect(sink.lines()).toHaveLength(1);
    expect(sink.lines()[0]).toMatchObject({
      correlationId: 'corr-1',
      jobId: 'job-9',
      event: 'job.started',
      msg: 'Trabajo iniciado',
    });
  });

  it('CA-13: fuera de un contexto no inventa `correlationId`', () => {
    const sink = memorySink();
    const logger = pino(buildPinoOptions({ level: 'info' }), sink);

    logger.info({ event: 'api.started' }, 'API arriba');

    expect(sink.lines()[0]).not.toHaveProperty('correlationId');
    expect(sink.lines()[0]).not.toHaveProperty('jobId');
  });

  it('CA-15: aplica `redactDeep` al objeto de la línea en cualquier nivel y conserva el resto', () => {
    const sink = memorySink();
    const logger = pino(buildPinoOptions({ level: 'info' }), sink);

    logger.info(
      {
        event: 'user.login',
        password: 'p4ss',
        user: { id: 'u-1', session: { token: 'tkn' } },
        headers: { authorization: 'Bearer x' },
      },
      'Inicio de sesión',
    );

    expect(sink.lines()[0]).toMatchObject({
      event: 'user.login',
      password: '[REDACTED]',
      user: { id: 'u-1', session: { token: '[REDACTED]' } },
      headers: { authorization: '[REDACTED]' },
      msg: 'Inicio de sesión',
    });
  });

  it('CA-15: redacta las cabeceras sensibles de `req`/`res` que pino-http agrega como enlace del hijo', () => {
    const sink = memorySink();
    const logger = pino(buildPinoOptions({ level: 'info' }), sink);
    const child = logger.child({
      req: { headers: { authorization: 'Bearer x', cookie: 'sid=1', host: 'localhost' } },
      res: { headers: { 'set-cookie': 'sid=2' } },
    });

    child.info('request completed');

    const line = sink.lines()[0];
    expect(at(line, 'req', 'headers', 'authorization')).toBe('[REDACTED]');
    expect(at(line, 'req', 'headers', 'cookie')).toBe('[REDACTED]');
    expect(at(line, 'req', 'headers', 'host')).toBe('localhost');
    expect(at(line, 'res', 'headers', 'set-cookie')).toBe('[REDACTED]');
  });

  it('CA-15: respeta el nivel configurado', () => {
    const sink = memorySink();
    const logger = pino(buildPinoOptions({ level: 'warn' }), sink);

    logger.info('no debería escribirse');
    logger.warn('sí');

    expect(sink.lines()).toHaveLength(1);
    expect(sink.lines()[0]).toMatchObject({ msg: 'sí' });
  });
});

describe('buildLoggerModuleParams', () => {
  interface PinoHttpUnderTest {
    genReqId: (req: IncomingMessage, res: unknown) => string;
    customProps: (req: IncomingMessage, res: unknown) => Record<string, unknown>;
    serializers: { req: (req: Record<string, unknown>) => Record<string, unknown> };
  }
  const pinoHttpOf = (level: string): PinoHttpUnderTest => {
    const params = buildLoggerModuleParams({ level });
    // `pinoHttp` admite varias formas; la nuestra es siempre el objeto de opciones.
    return params.pinoHttp as unknown as PinoHttpUnderTest;
  };
  const fakeReq = (url: string): IncomingMessage =>
    ({
      method: 'GET',
      url,
      headers: {},
      socket: {},
      query: { token: 'abc' },
    }) as unknown as IncomingMessage;

  it('CA-13: `genReqId` usa el `correlationId` ya fijado por el middleware', () => {
    const { genReqId } = pinoHttpOf('info');

    const id = CorrelationContext.run({ correlationId: 'corr-7' }, () =>
      genReqId(fakeReq('/api/v1/health/live'), {}),
    );

    expect(id).toBe('corr-7');
  });

  it('CA-13: `genReqId` sin contexto genera un UUID v4', () => {
    const { genReqId } = pinoHttpOf('info');

    expect(genReqId(fakeReq('/api/v1/health/live'), {})).toMatch(UUID_V4);
  });

  it('CA-13: `customProps` marca la línea como `http.request` (el `correlationId` lo aporta el `mixin`)', () => {
    const { customProps } = pinoHttpOf('info');

    expect(customProps(fakeReq('/api/v1/health/live'), {})).toEqual({ event: 'http.request' });
  });

  it('CA-15: la línea `http.request` no incluye la cadena de consulta de la URL', () => {
    const { serializers } = pinoHttpOf('info');

    const serialized = serializers.req(
      fakeReq('/api/v1/files?token=abc&x=1') as unknown as Record<string, unknown>,
    );

    expect(serialized.url).toBe('/api/v1/files');
    expect(serialized.method).toBe('GET');
    expect(serialized).not.toHaveProperty('query');
  });
});
