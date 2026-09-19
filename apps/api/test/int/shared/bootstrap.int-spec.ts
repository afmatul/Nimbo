import { spawnSync } from 'node:child_process';
import { connect } from 'node:net';
import { resolve } from 'node:path';

const API_ROOT = resolve(__dirname, '../../..');
const TEST_PORT = 3999;

/** Entorno mínimo sin `DATABASE_URL`; nada del entorno del arnés se hereda (allí sí está definida). */
const envWithoutDatabase = (): NodeJS.ProcessEnv => ({
  PATH: process.env.PATH,
  NODE_ENV: 'test',
  APP_ENV: 'test',
  LOG_LEVEL: 'info',
  PORT: String(TEST_PORT),
  REDIS_URL: 'redis://localhost:6379',
  MINIO_ENDPOINT: 'http://localhost:9000',
  MINIO_ACCESS_KEY: 'nimbo',
  MINIO_SECRET_KEY: 'nimbo-secret',
});

const portIsClosed = (port: number): Promise<boolean> =>
  new Promise((resolvePromise) => {
    const socket = connect({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolvePromise(false);
    });
    socket.once('error', () => {
      resolvePromise(true);
    });
  });

describe('bootstrap de api (CA-18)', () => {
  it('CA-18: sin `DATABASE_URL` el proceso no arranca: exit ≠ 0, una línea `config.invalid`, ningún puerto abierto', async () => {
    const result = spawnSync(process.execPath, [require.resolve('tsx/cli'), 'src/main.ts'], {
      cwd: API_ROOT,
      env: envWithoutDatabase(),
      encoding: 'utf8',
      timeout: 60_000,
    });

    expect(result.status).not.toBe(0);
    const stderrLines = result.stderr.split('\n').filter((line) => line.trim() !== '');
    expect(stderrLines).toHaveLength(1);
    expect(JSON.parse(stderrLines[0] ?? '')).toEqual({
      event: 'config.invalid',
      issues: ['`DATABASE_URL` es obligatoria'],
    });
    expect(result.stdout.trim()).toBe('');
    await expect(portIsClosed(TEST_PORT)).resolves.toBe(true);
  });
});
