import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';

import { compiledEntry } from '../setup/compiled-api';

const API_ROOT = resolve(__dirname, '../../..');
const START_TIMEOUT_MS = 60_000;

/**
 * Entorno mínimo y válido del worker; no hereda el del arnés. Los valores van explícitos porque el proceso carga el
 * `.env` de la raíz y allí las variables existen: lo del entorno siempre gana.
 */
const minimalWorkerEnv = (): NodeJS.ProcessEnv => ({
  PATH: process.env.PATH,
  NODE_ENV: 'test',
  APP_ENV: 'test',
  LOG_LEVEL: 'info',
  WORKER_PORT: '3998',
  DATABASE_URL: 'postgres://nimbo:nimbo@localhost:5432/nimbo',
  REDIS_URL: 'redis://localhost:6379',
  MINIO_ENDPOINT: 'http://localhost:9000',
  MINIO_ACCESS_KEY: 'nimbo',
  MINIO_SECRET_KEY: 'nimbo-secret',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  SMTP_TLS: 'none',
  MAIL_FROM: 'Nimbo <no-responder@nimbo.me>',
});

const runWorkerSync = (env: NodeJS.ProcessEnv) =>
  spawnSync(process.execPath, [require.resolve('tsx/cli'), 'src/worker.main.ts'], {
    cwd: API_ROOT,
    env,
    encoding: 'utf8',
    timeout: START_TIMEOUT_MS,
  });

/** El worker no arranca: exit ≠ 0 y una sola línea `config.invalid` con estas issues. */
const expectConfigInvalid = (env: NodeJS.ProcessEnv, issues: readonly string[]): void => {
  const result = runWorkerSync(env);

  expect(result.status).not.toBe(0);
  const stderrLines = result.stderr.split('\n').filter((line) => line.trim() !== '');
  expect(stderrLines).toHaveLength(1);
  expect(JSON.parse(stderrLines[0] ?? '')).toEqual({ event: 'config.invalid', issues });
};

const freePort = async (): Promise<number> => {
  const server = createServer();
  await new Promise<void>((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolvePromise) => server.close(resolvePromise));
  return port;
};

/**
 * Arranca el worker compilado con `tsc` (con `tsx` la inyección por tipo de Nest falla, `compiled-api.ts`) y el
 * entorno del arnés (Redis real); devuelve la línea `worker.started`.
 */
const waitForWorkerStarted = (env: NodeJS.ProcessEnv): Promise<Record<string, unknown>> =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [compiledEntry('worker.main')], { cwd: API_ROOT, env });
    let buffer = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('El worker no registró `worker.started` a tiempo'));
    }, START_TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const started = buffer
        .split('\n')
        .filter((line) => line.startsWith('{'))
        .map((line) => JSON.parse(line) as Record<string, unknown>)
        .find((line) => line.event === 'worker.started');
      if (started === undefined) return;
      clearTimeout(timer);
      child.kill();
      resolvePromise(started);
    });
    child.once('error', reject);
  });

describe('bootstrap del worker (CA-18, CA-21)', () => {
  it('CA-18: con `REDIS_URL` inválida el worker no arranca: exit ≠ 0 y una sola línea `config.invalid`', () => {
    expectConfigInvalid({ ...minimalWorkerEnv(), REDIS_URL: 'no-es-url' }, [
      '`REDIS_URL` debe ser una URL válida',
    ]);
  });

  it('CA-21: sin `SMTP_HOST` el worker no arranca (`config.invalid`)', () => {
    expectConfigInvalid({ ...minimalWorkerEnv(), SMTP_HOST: '' }, [
      '`SMTP_HOST` no puede estar vacía',
    ]);
  });

  it('CA-20: con `SMTP_TLS=none` y `APP_ENV=staging` el worker no arranca (`config.invalid`)', () => {
    expectConfigInvalid({ ...minimalWorkerEnv(), APP_ENV: 'staging' }, [
      '`SMTP_TLS` no puede ser `none` en staging ni en producción',
    ]);
  });

  it('CA-21, 005 CA-9, 006 CA-19, 007 CA-13, 009 CA-2: `worker.started` lista las colas `ping`, `mail`, `upload-cleanup`, `trash-purge`, `usage-reconcile` y `subscription-reconcile`', async () => {
    const env = { ...process.env, WORKER_PORT: String(await freePort()) };

    const started = await waitForWorkerStarted(env);

    expect(started.queues).toEqual([
      'ping',
      'mail',
      'upload-cleanup',
      'trash-purge',
      'usage-reconcile',
      'subscription-reconcile',
    ]);
  });
});
