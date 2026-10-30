import { Body, Controller, Global, HttpCode, Module, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { EnvModule } from '../infrastructure/config/env.module';
import type { Env, SharedEnvBase } from '../infrastructure/config/env.schema';
import { createLoggerModule, LOG_STREAM } from '../infrastructure/logging/logger.module';

import { configureHttpApp } from './configure-http-app';

const HTTP_ENV: SharedEnvBase & Pick<Env, 'CORS_ORIGIN'> = {
  NODE_ENV: 'test',
  APP_ENV: 'test',
  APP_VERSION: 'test',
  LOG_LEVEL: 'info',
  DATABASE_URL: 'postgres://nimbo@localhost:5432/nimbo',
  REDIS_URL: 'redis://localhost:6379',
  CORS_ORIGIN: ['https://app.nimbo.test'],
};
const MALFORMED_JSON = '{"email":';

/** Las bitácoras de la app de prueba se descartan: aquí solo interesan las cabeceras. */
@Global()
@Module({
  providers: [{ provide: LOG_STREAM, useValue: { write: (): void => undefined } }],
  exports: [LOG_STREAM],
})
class DiscardLogsModule {}

@Controller()
class EchoController {
  @Post(['auth/register', 'backoffice/echo', 'agent/ask', 'echo'])
  @HttpCode(200)
  echo(@Body() body: unknown): unknown {
    return body ?? null;
  }
}

/**
 * `configureHttpApp` sin contenedores (plan 001 §5, 011 CA-13): las rutas de `auth` y del backoffice responden
 * `Cache-Control: no-store` también cuando el analizador JSON rechaza el cuerpo, antes de que corran los *middlewares*
 * de módulo.
 */
describe('configureHttpApp: `no-store` antes del analizador (001 CA-6)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DiscardLogsModule, EnvModule.forRoot(HTTP_ENV), createLoggerModule()],
      controllers: [EchoController],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    configureHttpApp(app, HTTP_ENV);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const postRaw = (path: string, body: string) =>
    request(app.getHttpServer()).post(path).set('Content-Type', 'application/json').send(body);

  it('CA-6: el `400` de un JSON mal formado en `/api/v1/auth/*` lleva `Cache-Control: no-store`', async () => {
    const response = await postRaw('/api/v1/auth/register', MALFORMED_JSON);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('011 CA-13: el `400` de un JSON mal formado en `/api/v1/backoffice/*` también lleva `no-store`', async () => {
    const response = await postRaw('/api/v1/backoffice/echo', MALFORMED_JSON);

    expect(response.status).toBe(400);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('020 CA-18: las respuestas de `/api/v1/agent/*` (preguntas, citas y nombres) llevan `no-store`', async () => {
    const response = await postRaw('/api/v1/agent/ask', '{"question":"¿Qué dice?"}');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('CA-6: la ruta se compara sin distinguir mayúsculas, como el enrutador de Express', async () => {
    const response = await postRaw('/API/v1/Auth/register', MALFORMED_JSON);

    expect(response.status).toBe(400);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('CA-6: una respuesta correcta de `auth` también sale con `no-store`', async () => {
    const response = await postRaw('/api/v1/auth/register', '{"email":"ana@nimbo.test"}');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('CA-6: fuera de `/api/v1/auth/`, `/api/v1/backoffice/` y `/api/v1/agent/` no se fija `no-store`', async () => {
    const response = await postRaw('/api/v1/echo', MALFORMED_JSON);

    expect(response.status).toBe(400);
    expect(response.headers['cache-control']).toBeUndefined();
  });
});
