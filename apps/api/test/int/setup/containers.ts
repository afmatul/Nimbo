import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';
import type { StartedRedisContainer } from '@testcontainers/redis';
import { GenericContainer, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';

/** Mismas imágenes que `compose.yml` (plan 000 §6.5). */
export const POSTGRES_IMAGE = 'pgvector/pgvector:pg17';
export const REDIS_IMAGE = 'redis:7-alpine';
export const MINIO_IMAGE = 'quay.io/minio/minio';

const MINIO_PORT = 9000;
const MINIO_USER = 'nimbo';
const MINIO_PASSWORD = 'nimbo-secret';
export const TEST_BUCKET = 'nimbo-test';

export interface TestInfra {
  readonly postgres: StartedPostgreSqlContainer;
  readonly redis: StartedRedisContainer;
  readonly minio: StartedTestContainer;
  /** Variables que `apiEnvSchema` necesita para apuntar a estos contenedores. */
  env(): Record<string, string>;
  stopAll(): Promise<void>;
}

const startMinio = async (): Promise<StartedTestContainer> =>
  new GenericContainer(MINIO_IMAGE)
    .withCommand(['server', '/data'])
    .withEnvironment({ MINIO_ROOT_USER: MINIO_USER, MINIO_ROOT_PASSWORD: MINIO_PASSWORD })
    .withExposedPorts(MINIO_PORT)
    .withWaitStrategy(Wait.forHttp('/minio/health/live', MINIO_PORT))
    .start();

const minioEndpoint = (minio: StartedTestContainer): string =>
  `http://${minio.getHost()}:${String(minio.getMappedPort(MINIO_PORT))}`;

const createBucket = async (endpoint: string): Promise<void> => {
  const client = new S3Client({
    endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: MINIO_USER, secretAccessKey: MINIO_PASSWORD },
  });
  await client.send(new CreateBucketCommand({ Bucket: TEST_BUCKET }));
  client.destroy();
};

/** Arranca Postgres, Redis y MinIO en paralelo y deja el bucket de pruebas creado. */
export const startTestInfra = async (): Promise<TestInfra> => {
  const [postgres, redis, minio] = await Promise.all([
    new PostgreSqlContainer(POSTGRES_IMAGE).start(),
    new RedisContainer(REDIS_IMAGE).start(),
    startMinio(),
  ]);
  const endpoint = minioEndpoint(minio);
  await createBucket(endpoint);
  return {
    postgres,
    redis,
    minio,
    env: () => ({
      DATABASE_URL: postgres.getConnectionUri(),
      REDIS_URL: redis.getConnectionUrl(),
      MINIO_ENDPOINT: endpoint,
      MINIO_ACCESS_KEY: MINIO_USER,
      MINIO_SECRET_KEY: MINIO_PASSWORD,
      MINIO_BUCKET: TEST_BUCKET,
      MINIO_REGION: 'us-east-1',
    }),
    stopAll: async () => {
      await Promise.all([postgres.stop(), redis.stop(), minio.stop()]);
    },
  };
};
