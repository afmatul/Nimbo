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
  MINIO_PUBLIC_ENDPOINT: 'http://localhost:9000',
  UPLOAD_PART_SIZE_BYTES: 8_388_608,
  UPLOAD_MULTIPART_THRESHOLD_BYTES: 16_777_216,
  UPLOAD_URL_TTL_SECONDS: 3600,
  UPLOAD_COMPLETE_TIMEOUT_SECONDS: 900,
  RATE_LIMIT_UPLOAD_INIT_PER_MINUTE: 300,
  RATE_LIMIT_DOWNLOAD_URL_PER_MINUTE: 120,
  RATE_LIMIT_PREVIEW_URL_PER_MINUTE: 120,
  FOLDER_MAX_DEPTH: 10,
  QUICK_ACCESS_MAX_PINNED: 5,
  QUICK_ACCESS_RECENT_VISIBLE: 3,
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
