import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import request from 'supertest';

import { configureHttpApp, EnvModule } from '../../../src/shared';
import type { Env, SharedEnvBase } from '../../../src/shared';
import { createLoggerModule } from '../../../src/shared/infrastructure/logging/logger.module';
import { MetricsModule } from '../../../src/shared/infrastructure/metrics/metrics.module';
import { createLogSinkModule, LogSink } from '../setup/log-sink';

const ALLOWED_ORIGIN = 'https://app.nimbo.test';
const FOREIGN_ORIGIN = 'https://intruso.example';
const CLIENT_IP = '203.0.113.7';
const OVERSIZED_BODY_BYTES = 17 * 1024;

/**
 * Solo lo que `configureHttpApp` y el logger leen. Las URL de Postgres y Redis completan el contrato común, pero la
 * app no importa `SharedModule` y nunca se conecta: la suite corre sin contenedores.
 */
const HTTP_ENV: SharedEnvBase & Pick<Env, 'CORS_ORIGIN'> = {
  NODE_ENV: 'test',
  APP_ENV: 'test',
  APP_VERSION: 'test',
  LOG_LEVEL: 'info',
  DATABASE_URL: 'postgres://nimbo@localhost:5432/nimbo',
  REDIS_URL: 'redis://localhost:6379',
  CORS_ORIGIN: [ALLOWED_ORIGIN],
};

interface Echo {
  readonly body: unknown;
  readonly ip: string | undefined;
}

/** Controlador de prueba: devuelve el cuerpo que vio Nest (`null` si no hubo analizador) y `req.ip`. */
@Controller('echo')
class EchoController {
  @Post()
  @HttpCode(200)
  echo(@Body() body: unknown, @Req() req: Request): Echo {
    return { body: body ?? null, ip: req.ip };
  }
}

describe('configureHttpApp (001 CA-6, CA-15)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        createLogSinkModule(new LogSink()),
        EnvModule.forRoot(HTTP_ENV),
        createLoggerModule(),
        MetricsModule,
      ],
      controllers: [EchoController],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      bufferLogs: true,
    });
    configureHttpApp(app, HTTP_ENV);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const post = () => request(app.getHttpServer()).post('/api/v1/echo');

  it('CA-6: un cuerpo JSON válido llega parseado bajo el prefijo `/api/v1`', async () => {
    const response = await post().send({ email: 'ana@nimbo.test' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ body: { email: 'ana@nimbo.test' } });
  });

  it('CA-6: `text/plain` queda sin cuerpo (solo se analiza JSON)', async () => {
    const response = await post().set('Content-Type', 'text/plain').send('email=ana@nimbo.test');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ body: null });
  });

  it('CA-6: `application/x-www-form-urlencoded` queda sin cuerpo', async () => {
    const response = await post().type('form').send({ email: 'ana@nimbo.test' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ body: null });
  });

  it('CA-6: un JSON de más de 16 KB → 413 con el cuerpo de error común', async () => {
    const response = await post().send({ relleno: 'x'.repeat(OVERSIZED_BODY_BYTES) });

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({ code: 'HTTP_413' });
    expect(typeof response.body.correlationId).toBe('string');
  });

  it('CA-6 (P-1): un JSON mal formado → 400 VALIDATION_FAILED', async () => {
    const response = await post().set('Content-Type', 'application/json').send('{"email":');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('CA-15: con `X-Forwarded-For` de un salto, `req.ip` es la IP del cliente (`trust proxy = 1`)', async () => {
    const response = await post().set('X-Forwarded-For', CLIENT_IP).send({});

    expect(response.body).toMatchObject({ ip: CLIENT_IP });
  });

  it('CA-15: la respuesta lleva `x-nimbo-version` y `x-correlation-id`', async () => {
    const response = await post().send({});

    expect(response.headers['x-nimbo-version']).toBe('test');
    expect(response.headers['x-correlation-id']).toEqual(expect.any(String));
  });

  it('CA-15 (001), CA-1/CA-7 (002): un origen permitido recibe CORS con credenciales y ve `x-correlation-id` y `retry-after`', async () => {
    const response = await post().set('Origin', ALLOWED_ORIGIN).send({});

    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    const exposed = String(response.headers['access-control-expose-headers']).toLowerCase();
    expect(exposed).toContain('x-correlation-id');
    expect(exposed).toContain('retry-after');
  });

  it('CA-7/CA-28 (002): la verificación previa admite `DELETE` y `authorization`, con credenciales', async () => {
    const response = await request(app.getHttpServer())
      .options('/api/v1/echo')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'DELETE')
      .set('Access-Control-Request-Headers', 'authorization,content-type');

    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-methods']).toBe('GET,POST,DELETE');
    expect(String(response.headers['access-control-allow-headers']).toLowerCase()).toBe(
      'content-type,x-correlation-id,authorization',
    );
  });

  it('CA-15 (001), CA-28 (002): un origen no permitido no recibe cabeceras CORS', async () => {
    const response = await request(app.getHttpServer())
      .options('/api/v1/echo')
      .set('Origin', FOREIGN_ORIGIN)
      .set('Access-Control-Request-Method', 'POST');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('CA-28 (002): nunca responde el comodín `*`, tampoco sin `Origin`', async () => {
    const [withOrigin, withoutOrigin] = await Promise.all([
      post().set('Origin', ALLOWED_ORIGIN).send({}),
      post().send({}),
    ]);

    expect(withOrigin.headers['access-control-allow-origin']).not.toBe('*');
    expect(withoutOrigin.headers['access-control-allow-origin']).toBeUndefined();
  });
});
