import { Test } from '@nestjs/testing';

import type { Env } from './env.schema';
import { MINIO_CONFIG, MinioConfigModule } from './minio-config.module';
import type { MinioConfig } from './minio-config.module';

const API_ENV: Env = {
  NODE_ENV: 'test',
  APP_ENV: 'test',
  APP_VERSION: 'test',
  LOG_LEVEL: 'info',
  DATABASE_URL: 'postgres://nimbo:nimbo@localhost:5432/nimbo',
  REDIS_URL: 'redis://localhost:6379',
  PORT: 3000,
  WORKER_PORT: 3001,
  MINIO_ENDPOINT: 'http://localhost:9000',
  MINIO_ACCESS_KEY: 'nimbo',
  MINIO_SECRET_KEY: 'nimbo-secret',
  MINIO_BUCKET: 'nimbo',
  MINIO_REGION: 'us-east-1',
  WEB_PUBLIC_URL: 'http://localhost',
  CORS_ORIGIN: ['http://localhost'],
  JWT_ACCESS_SECRET: 'secreto-de-prueba-de-al-menos-32-caracteres',
};

describe('MinioConfigModule.forRoot', () => {
  it('CA-21: provee bajo `MINIO_CONFIG` solo las variables de MinIO, no el entorno completo', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MinioConfigModule.forRoot(API_ENV)],
    }).compile();

    const config = moduleRef.get<MinioConfig>(MINIO_CONFIG);

    expect(config).toEqual({
      MINIO_ENDPOINT: 'http://localhost:9000',
      MINIO_ACCESS_KEY: 'nimbo',
      MINIO_SECRET_KEY: 'nimbo-secret',
      MINIO_BUCKET: 'nimbo',
      MINIO_REGION: 'us-east-1',
    });
    expect(Object.keys(config).sort()).not.toContain('DATABASE_URL');
  });
});
