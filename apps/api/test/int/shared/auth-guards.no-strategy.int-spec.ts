import { Controller, Get } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Logger, LoggerModule } from 'nestjs-pino';
import request from 'supertest';

import {
  ALL_ROLES,
  AuthGuardsModule,
  CorrelationIdMiddleware,
  DomainExceptionFilter,
  Public,
  Roles,
} from '../../../src/shared';
import { buildLoggerModuleParams } from '../../../src/shared/infrastructure/logging/logger.options';
import { LogSink } from '../setup/log-sink';

/** Un token con forma de JWT: sin estrategia registrada, su validez no importa. */
const ANY_BEARER = 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJh';

@Controller('no-strategy')
class NoStrategyController {
  @Public()
  @Get('public')
  public(): { ok: true } {
    return { ok: true };
  }

  @Roles(...ALL_ROLES)
  @Get('protected')
  protected(): { ok: true } {
    return { ok: true };
  }
}

/**
 * Archivo propio: el registro de Passport es por proceso y aquí **no** debe haber estrategia `'jwt'` (003 §6.2). Se
 * monta con `Test.createTestingModule`, no con `createTestApp`, que siempre registra la de prueba.
 */
describe('Guards globales sin estrategia registrada (003 CA-1, CA-2)', () => {
  const logs = new LogSink();
  let app: INestApplication | undefined;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        LoggerModule.forRoot(buildLoggerModuleParams({ level: 'info', stream: logs })),
        AuthGuardsModule,
      ],
      controllers: [NoStrategyController],
    }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    const logger = app.get(Logger);
    app.useLogger(logger);
    const correlation = new CorrelationIdMiddleware();
    app.use(correlation.use.bind(correlation));
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new DomainExceptionFilter(logger));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  const server = (): Parameters<typeof request>[0] => {
    if (app === undefined) throw new Error('app no inicializada');
    return app.getHttpServer();
  };

  it('CA-1/CA-2: una ruta no pública con cualquier `Bearer` → 401 `SHARED_UNAUTHENTICATED` (nunca 500)', async () => {
    logs.clear();

    const response = await request(server())
      .get('/api/v1/no-strategy/protected')
      .set('Authorization', ANY_BEARER);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: 'SHARED_UNAUTHENTICATED' });
    const unauthenticated = logs.lines().filter((line) => line.event === 'auth.unauthenticated');
    expect(unauthenticated).toEqual([
      expect.objectContaining({
        route: 'GET /api/v1/no-strategy/protected',
        reason: 'invalid_token',
      }),
    ]);
  });

  it('CA-1: una ruta pública responde 200', async () => {
    const response = await request(server()).get('/api/v1/no-strategy/public');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});
