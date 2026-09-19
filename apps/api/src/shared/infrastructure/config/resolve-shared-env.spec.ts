import { resolveSharedEnv } from './resolve-shared-env';

const COMMON = {
  NODE_ENV: 'test',
  APP_ENV: 'test',
  LOG_LEVEL: 'info',
  DATABASE_URL: 'postgres://nimbo:nimbo@localhost:5432/nimbo',
  REDIS_URL: 'redis://localhost:6379',
};

const MINIO = {
  MINIO_ENDPOINT: 'http://localhost:9000',
  MINIO_ACCESS_KEY: 'nimbo',
  MINIO_SECRET_KEY: 'nimbo-secret',
};

describe('resolveSharedEnv', () => {
  it('CA-18: con el contrato completo de `api` devuelve `Env` con `MINIO_*`', () => {
    const env = resolveSharedEnv({ ...COMMON, ...MINIO });

    expect(env).toMatchObject({ ...COMMON, ...MINIO, PORT: 3000, MINIO_BUCKET: 'nimbo' });
  });

  it('CA-18: sin `MINIO_*` devuelve el contrato del `worker` (sin exigirlas)', () => {
    const env = resolveSharedEnv(COMMON);

    expect(env).toMatchObject({ ...COMMON, WORKER_PORT: 3001 });
    expect(env).not.toHaveProperty('MINIO_ENDPOINT');
  });

  it('CA-18: si ni siquiera el contrato común se cumple, lanza con las issues y sin valores', () => {
    expect(() =>
      resolveSharedEnv({ NODE_ENV: 'test', APP_ENV: 'test', LOG_LEVEL: 'info' }),
    ).toThrow(/`DATABASE_URL` es obligatoria; `REDIS_URL` es obligatoria/);
  });
});
