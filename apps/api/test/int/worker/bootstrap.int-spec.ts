import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';

import { compiledEntry } from '../setup/compiled-api';
import type { ApiEntry } from '../setup/compiled-api';

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
 * entorno del arnés (Redis real); devuelve la línea `worker.started` después de correr `whileRunning` con el proceso vivo.
 */
const waitForWorkerStarted = (
  env: NodeJS.ProcessEnv,
  entry: ApiEntry = 'worker.main',
  whileRunning: () => Promise<void> = () => Promise.resolve(),
): Promise<Record<string, unknown>> =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [compiledEntry(entry)], { cwd: API_ROOT, env });
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
      buffer = '';
      whileRunning().then(
        () => {
          child.kill();
          resolvePromise(started);
        },
        (error: unknown) => {
          child.kill();
          reject(error);
        },
      );
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

  it('CA-21, 005 CA-9, 006 CA-19, 007 CA-13, 009 CA-2 y CA-6, 010 CA-1, 019 CA-8 y CA-23: `worker.started` lista las colas `ping`, `mail`, `upload-cleanup`, `trash-purge`, `usage-reconcile`, `subscription-reconcile`, `invoice-retry`, `subscription-renewal`, `indexing` e `index-reconcile`', async () => {
    const port = await freePort();
    const env = {
      ...process.env,
      WORKER_PORT: String(port),
      WORKER_OPTIMIZER_PORT: '0',
      OPTIMIZER_MAX_ATTEMPTS: '0',
      OPTIMIZER_TIMEOUT_MS: '0',
      OPTIMIZER_MAX_PIXELS: '0',
      OPTIMIZER_MIN_SAVED_PERCENT: '0',
      OPTIMIZER_MIN_SAVED_BYTES: '0',
      OPTIMIZER_JPEG_QUALITY: '0',
    };

    const started = await waitForWorkerStarted(env, 'worker.main', async () => {
      const live = await fetch(`http://127.0.0.1:${String(port)}/health/live`);
      expect(live.status).toBe(200);
    });

    expect(started.process).toBe('worker');
    expect(started.queues).toEqual([
      'ping',
      'mail',
      'upload-cleanup',
      'trash-purge',
      'usage-reconcile',
      'subscription-reconcile',
      'invoice-retry',
      'subscription-renewal',
      'indexing',
      'index-reconcile',
    ]);
  });

  /** Lo que el `worker` general rechaza (CA-20, CA-21) y el `worker-optimizer` no lee (PD-159). */
  const BROKEN_MAIL = { SMTP_HOST: '', SMTP_TLS: 'invalido', MAIL_FROM: '' };
  const runOptimizerSync = (env: NodeJS.ProcessEnv) =>
    spawnSync(process.execPath, [compiledEntry('worker-optimizer.main')], {
      cwd: API_ROOT,
      env,
      encoding: 'utf8',
      timeout: START_TIMEOUT_MS,
    });
  const jsonLines = (output: string): Record<string, unknown>[] =>
    output
      .split('\n')
      .filter((line) => line.startsWith('{'))
      .map((line) => JSON.parse(line) as Record<string, unknown>);

  it('ADR-0038, PD-159: el `worker-optimizer` escucha en `WORKER_OPTIMIZER_PORT` (no en `WORKER_PORT`), sin SMTP válido, y consume solo `optimization`', async () => {
    const generalPort = await freePort();
    const optimizerPort = await freePort();
    const env = {
      ...process.env,
      ...BROKEN_MAIL,
      GEMINI_EMBEDDING_MODEL: '',
      INDEXING_MAX_ATTEMPTS: '0',
      OPTIMIZER_MAX_ATTEMPTS: '0',
      WORKER_PORT: String(generalPort),
      WORKER_OPTIMIZER_PORT: String(optimizerPort),
    };

    const started = await waitForWorkerStarted(env, 'worker-optimizer.main', async () => {
      const live = await fetch(`http://127.0.0.1:${String(optimizerPort)}/health/live`);
      expect(live.status).toBe(200);
      await expect(fetch(`http://127.0.0.1:${String(generalPort)}/health/live`)).rejects.toThrow();
    });

    expect(started.process).toBe('worker-optimizer');
    expect(started.queues).toEqual(['optimization']);
  });

  it('PD-159: una variable del optimizador inválida impide arrancar: exit ≠ 0 y una sola línea `config.invalid`', () => {
    const result = runOptimizerSync({ ...process.env, OPTIMIZER_JPEG_QUALITY: '0' });

    expect(result.status).not.toBe(0);
    const lines = result.stderr.split('\n').filter((line) => line.trim() !== '');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({ event: 'config.invalid' });
    expect(lines[0]).toContain('OPTIMIZER_JPEG_QUALITY');
  });

  it('M-4: un arranque fallido (base de datos inalcanzable) deja una línea `worker.start_failed` con el proceso y la clase del error, sin la URL, y sale con 1', async () => {
    const closedPort = await freePort();
    const url = `postgres://nimbo_app:clave-que-no-debe-salir@127.0.0.1:${String(closedPort)}/nimbo`;

    // Reintentos cortos: con los 3 s de producción esta prueba espera ~30 s a que se agoten los 10 intentos.
    const result = runOptimizerSync({
      ...process.env,
      DATABASE_URL: url,
      DATABASE_RETRY_DELAY_MS: '100',
    });

    expect(result.status).toBe(1);
    const failure = jsonLines(result.stderr).find((line) => line.event === 'worker.start_failed');
    expect(failure).toEqual({
      event: 'worker.start_failed',
      process: 'worker-optimizer',
      errorClass: expect.any(String),
    });
    expect(`${result.stdout}${result.stderr}`).not.toContain('clave-que-no-debe-salir');
  }, 90_000);
});
