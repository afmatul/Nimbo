import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';

import request from 'supertest';

import { PingProcessor } from '../../../src/shared';
import { WorkerModule } from '../../../src/worker.module';
import { startTestInfra } from '../setup/containers';
import type { TestInfra } from '../setup/containers';
import { buildTestEnv, createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';

const REPO_ROOT = resolve(__dirname, '../../../../..');
const HEALTHCHECK_SCRIPT = resolve(REPO_ROOT, 'apps/worker/src/healthcheck.ts');

/** Asíncrono a propósito: un `spawnSync` bloquearía el servidor que vive en este mismo proceso. */
const runHealthcheck = (port: number): Promise<number | null> =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [require.resolve('tsx/cli'), HEALTHCHECK_SCRIPT], {
      env: { ...process.env, WORKER_PORT: String(port) },
      stdio: 'ignore',
      timeout: 30_000,
    });
    child.once('exit', (code) => {
      resolvePromise(code);
    });
    child.once('error', reject);
  });

/** El worker escucha en un puerto real para que `healthcheck.ts` lo consulte como en la imagen. */
describe('salud del worker (CA-23)', () => {
  let infra: TestInfra | undefined;
  let testApp: TestApp | undefined;
  let port = 0;

  beforeAll(async () => {
    infra = await startTestInfra();
    const env = buildTestEnv(infra.env());
    testApp = await createTestApp({
      env: infra.env(),
      modules: [WorkerModule.forRoot(env)],
      prefix: '',
    });
    await testApp.app.listen(0);
    port = (testApp.app.getHttpServer().address() as AddressInfo).port;
  }, 180_000);

  afterAll(async () => {
    // Con Redis caído el `Worker` de BullMQ reintenta para siempre; se cierra a la fuerza antes de apagar la app.
    await testApp?.app.get(PingProcessor).worker.close(true);
    await Promise.allSettled([testApp?.close(), infra?.stopAll()]);
  }, 60_000);

  const ready = (): { app: TestApp; containers: TestInfra } => {
    if (testApp === undefined || infra === undefined) throw new Error('arnés no inicializado');
    return { app: testApp, containers: infra };
  };

  it('CA-23: con Redis arriba `GET /health/ready` → 200 { status: "ok", checks: { redis: "up" } } y `healthcheck.ts` sale 0', async () => {
    const response = await request(ready().app.app.getHttpServer()).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', checks: { redis: 'up' } });
    await expect(runHealthcheck(port)).resolves.toBe(0);
  });

  it('CA-23: sin prefijo `/api/v1` (no es API pública)', async () => {
    const response = await request(ready().app.app.getHttpServer()).get('/api/v1/health/live');

    expect(response.status).toBe(404);
  });

  it('CA-23: con Redis detenido → 503 { …redis: "down" } y `healthcheck.ts` sale 1', async () => {
    await ready().containers.redis.stop();

    const response = await request(ready().app.app.getHttpServer()).get('/health/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'error', checks: { redis: 'down' } });
    await expect(runHealthcheck(port)).resolves.toBe(1);
  }, 60_000);
});
