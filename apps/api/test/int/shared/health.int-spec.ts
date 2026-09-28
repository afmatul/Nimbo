import request from 'supertest';

import {
  AuthGuardsModule,
  HealthModule,
  MinioHealthIndicator,
  PostgresHealthIndicator,
  RedisHealthIndicator,
} from '../../../src/shared';
import { startTestInfra } from '../setup/containers';
import type { TestInfra } from '../setup/containers';
import { createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';

const READY_LIMIT_MS = 2000;
const DEGRADED_LIMIT_MS = 3000;
const LIVE_LIMIT_MS = 100;
const FORBIDDEN_IN_BODY = [
  'localhost',
  '127.0.0.1',
  'MINIO_',
  'Error',
  'ECONNREFUSED',
  ':5432',
  ':6379',
  ':9000',
];

const elapsed = async <T>(work: () => Promise<T>): Promise<{ result: T; ms: number }> => {
  const start = performance.now();
  const result = await work();
  return { result, ms: performance.now() - start };
};

/** Esta suite arranca sus propios contenedores porque los detiene (CA-20, CA-22). */
describe('GET /api/v1/health (CA-20, CA-21, CA-22)', () => {
  let infra: TestInfra | undefined;
  let testApp: TestApp | undefined;

  beforeAll(async () => {
    infra = await startTestInfra();
    testApp = await createTestApp({
      env: infra.env(),
      modules: [
        AuthGuardsModule,
        HealthModule.forRoot({
          indicators: [PostgresHealthIndicator, RedisHealthIndicator, MinioHealthIndicator],
        }),
      ],
    });
  }, 180_000);

  afterAll(async () => {
    await Promise.allSettled([testApp?.close(), infra?.stopAll()]);
  }, 60_000);

  const ready = (): { app: TestApp; containers: TestInfra } => {
    if (testApp === undefined || infra === undefined) throw new Error('arnés no inicializado');
    return { app: testApp, containers: infra };
  };
  const server = (): Parameters<typeof request>[0] => ready().app.app.getHttpServer();

  it.each(['/api/v1/health/live', '/api/v1/health/ready'])(
    'CA-3: con los guards globales activos, %s responde 200 sin token y con un `Bearer` basura',
    async (path) => {
      const withoutToken = await request(server()).get(path);
      const withGarbage = await request(server()).get(path).set('Authorization', 'Bearer basura');

      expect(withoutToken.status).toBe(200);
      expect(withGarbage.status).toBe(200);
    },
  );

  it('CA-21: con Postgres, Redis y MinIO arriba → 200 con cuerpo exacto en menos de 2 s', async () => {
    const { result, ms } = await elapsed(() => request(server()).get('/api/v1/health/ready'));

    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      status: 'ok',
      checks: { postgres: 'up', redis: 'up', minio: 'up' },
    });
    expect(ms).toBeLessThan(READY_LIMIT_MS);
    expect(
      ready()
        .app.logs.lines()
        .some((line) => line.event === 'health.ready'),
    ).toBe(false);
  });

  it('CA-22: con Redis detenido → 503, `redis: down`, en menos de 3 s y sin topología ni credenciales', async () => {
    await ready().containers.redis.stop();
    ready().app.logs.clear();

    const { result, ms } = await elapsed(() => request(server()).get('/api/v1/health/ready'));

    expect(result.status).toBe(503);
    expect(result.body).toEqual({
      status: 'error',
      checks: { postgres: 'up', redis: 'down', minio: 'up' },
    });
    expect(ms).toBeLessThan(DEGRADED_LIMIT_MS);
    const raw = JSON.stringify(result.body);
    for (const forbidden of FORBIDDEN_IN_BODY) {
      expect(raw).not.toContain(forbidden);
    }
    const readyLogs = ready()
      .app.logs.lines()
      .filter((line) => line.event === 'health.ready');
    expect(readyLogs).toHaveLength(1);
    expect(readyLogs[0]).toMatchObject({ checks: { redis: 'down' } });
  }, 60_000);

  it('CA-20: con las tres dependencias detenidas → `live` sigue en 200 { status: "ok" } en menos de 100 ms', async () => {
    await Promise.all([ready().containers.postgres.stop(), ready().containers.minio.stop()]);
    await request(server()).get('/api/v1/health/live');

    const { result, ms } = await elapsed(() => request(server()).get('/api/v1/health/live'));

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ status: 'ok' });
    expect(ms).toBeLessThan(LIVE_LIMIT_MS);
  }, 60_000);
});
