import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const API_ROOT = resolve(__dirname, '../../..');

/**
 * Entorno mínimo del worker con `REDIS_URL` inválida; no hereda el del arnés. El valor va explícito porque
 * el proceso carga el `.env` de la raíz y allí la variable existe: lo del entorno siempre gana.
 */
const envWithInvalidRedis = (): NodeJS.ProcessEnv => ({
  PATH: process.env.PATH,
  NODE_ENV: 'test',
  APP_ENV: 'test',
  LOG_LEVEL: 'info',
  WORKER_PORT: '3998',
  DATABASE_URL: 'postgres://nimbo:nimbo@localhost:5432/nimbo',
  REDIS_URL: 'no-es-url',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  SMTP_TLS: 'none',
  MAIL_FROM: 'Nimbo <no-responder@nimbo.me>',
});

describe('bootstrap del worker (CA-18)', () => {
  it('CA-18: con `REDIS_URL` inválida el worker no arranca: exit ≠ 0 y una sola línea `config.invalid`', () => {
    const result = spawnSync(process.execPath, [require.resolve('tsx/cli'), 'src/worker.main.ts'], {
      cwd: API_ROOT,
      env: envWithInvalidRedis(),
      encoding: 'utf8',
      timeout: 60_000,
    });

    expect(result.status).not.toBe(0);
    const stderrLines = result.stderr.split('\n').filter((line) => line.trim() !== '');
    expect(stderrLines).toHaveLength(1);
    expect(JSON.parse(stderrLines[0] ?? '')).toEqual({
      event: 'config.invalid',
      issues: ['`REDIS_URL` debe ser una URL válida'],
    });
  });
});
