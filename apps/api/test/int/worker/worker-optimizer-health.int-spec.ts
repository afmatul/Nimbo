import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';

import request from 'supertest';

import { OptimizationProcessor } from '../../../src/modules/optimizer/infrastructure/optimization.processor';
import { WorkerOptimizerModule } from '../../../src/worker-optimizer.module';
import { buildOptimizerTestEnv } from '../../support/optimizer-env';
import { startTestInfra } from '../setup/containers';
import type { TestInfra } from '../setup/containers';
import { createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';

const REPO_ROOT = resolve(__dirname, '../../../../..');
const HEALTHCHECK_SCRIPT = resolve(REPO_ROOT, 'apps/worker/src/healthcheck.ts');

/**
 * Como en la imagen: `healthcheck.ts WORKER_OPTIMIZER_PORT`. `WORKER_PORT` apunta a otro puerto a propósito: si el
 * `HEALTHCHECK` leyera la variable del `worker` general, fallaría.
 */
const runHealthcheck = (port: number): Promise<number | null> =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [require.resolve('tsx/cli'), HEALTHCHECK_SCRIPT, 'WORKER_OPTIMIZER_PORT'],
      {
        env: { ...process.env, WORKER_OPTIMIZER_PORT: String(port), WORKER_PORT: '1' },
        stdio: 'ignore',
        timeout: 30_000,
      },
    );
    child.once('exit', (code) => {
      resolvePromise(code);
    });
    child.once('error', reject);
  });

/** El `worker-optimizer` (ADR-0037) expone la misma salud interna que el `worker` general, en su propio puerto. */
describe('salud del worker-optimizer (ADR-0037, CA-23)', () => {
  let infra: TestInfra | undefined;
  let testApp: TestApp | undefined;
  let port = 0;

  beforeAll(async () => {
    infra = await startTestInfra();
    const env = buildOptimizerTestEnv(infra.env());
    testApp = await createTestApp({
      validatedEnv: env,
      modules: [WorkerOptimizerModule.forRoot(env)],
      prefix: '',
    });
    await testApp.app.listen(0);
    port = (testApp.app.getHttpServer().address() as AddressInfo).port;
  }, 180_000);

  afterAll(async () => {
    // Con Redis caído el `Worker` de BullMQ reintenta para siempre; se cierra a la fuerza antes de apagar la app.
    await testApp?.app.get(OptimizationProcessor).worker.close(true);
    await Promise.allSettled([testApp?.close(), infra?.stopAll()]);
  }, 60_000);

  const ready = (): { app: TestApp; containers: TestInfra } => {
    if (testApp === undefined || infra === undefined) throw new Error('arnés no inicializado');
    return { app: testApp, containers: infra };
  };

  it('ADR-0037: `GET /health/live` → 200 sin prefijo `/api/v1`', async () => {
    const server = ready().app.app.getHttpServer();

    expect((await request(server).get('/health/live')).status).toBe(200);
    expect((await request(server).get('/api/v1/health/live')).status).toBe(404);
  });

  it('ADR-0037: con Redis arriba `GET /health/ready` → 200 y `healthcheck.ts WORKER_OPTIMIZER_PORT` sale 0', async () => {
    const response = await request(ready().app.app.getHttpServer()).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', checks: { redis: 'up' } });
    await expect(runHealthcheck(port)).resolves.toBe(0);
  });

  it('ADR-0037: con Redis detenido → 503 y `healthcheck.ts WORKER_OPTIMIZER_PORT` sale 1', async () => {
    await ready().containers.redis.stop();

    const response = await request(ready().app.app.getHttpServer()).get('/health/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'error', checks: { redis: 'down' } });
    await expect(runHealthcheck(port)).resolves.toBe(1);
  }, 60_000);
});
