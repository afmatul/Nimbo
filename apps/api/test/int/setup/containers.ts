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
export const MINIO_IMAGE = 'quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z';
/** Versión fijada del correo de pruebas (001 plan §6.8). */
export const MAILPIT_IMAGE = 'axllent/mailpit:v1.31.3';

const MINIO_PORT = 9000;
const MINIO_USER = 'nimbo';
const MINIO_PASSWORD = 'nimbo-secret';
export const TEST_BUCKET = 'nimbo-test';

const MAILPIT_SMTP_PORT = 1025;
const MAILPIT_API_PORT = 8025;
const TEST_MAIL_FROM = 'Nimbo <no-responder@nimbo.me>';
/** Variable solo de pruebas con la URL de la API de Mailpit (`test/int/setup/mailpit.ts`); no es del esquema. */
export const MAILPIT_API_URL_VAR = 'TEST_MAILPIT_API_URL';

export interface TestInfra {
  readonly postgres: StartedPostgreSqlContainer;
  readonly redis: StartedRedisContainer;
  readonly minio: StartedTestContainer;
  readonly mailpit: StartedTestContainer;
  /**
   * Variables que `apiEnvSchema` y `workerEnvSchema` necesitan para apuntar a estos contenedores, más
   * `TEST_MAILPIT_API_URL` para consultar la bandeja.
   */
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

export interface MailpitOptions {
  /** Puerto fijo del host para el SMTP (p. ej. levantar Mailpit en un puerto que el `worker` ya reintenta, CA-21). */
  readonly smtpHostPort?: number;
}

/** Mailpit sin TLS: SMTP en 1025 y API en 8025 (`/api/v1/messages`). */
export const startMailpit = async (options: MailpitOptions = {}): Promise<StartedTestContainer> =>
  new GenericContainer(MAILPIT_IMAGE)
    .withExposedPorts(
      options.smtpHostPort === undefined
        ? MAILPIT_SMTP_PORT
        : { container: MAILPIT_SMTP_PORT, host: options.smtpHostPort },
      MAILPIT_API_PORT,
    )
    .withWaitStrategy(Wait.forListeningPorts())
    .start();

/** Variables del `worker` que apuntan a un Mailpit, más la URL de su API para `mailpit.ts`. */
export const mailpitEnv = (mailpit: StartedTestContainer): Record<string, string> => ({
  SMTP_HOST: mailpit.getHost(),
  SMTP_PORT: String(mailpit.getMappedPort(MAILPIT_SMTP_PORT)),
  SMTP_TLS: 'none',
  MAIL_FROM: TEST_MAIL_FROM,
  [MAILPIT_API_URL_VAR]: `http://${mailpit.getHost()}:${String(mailpit.getMappedPort(MAILPIT_API_PORT))}`,
});

/** Arranca Postgres, Redis, MinIO y Mailpit en paralelo y deja el bucket de pruebas creado. */
export const startTestInfra = async (): Promise<TestInfra> => {
  const [postgres, redis, minio, mailpit] = await Promise.all([
    new PostgreSqlContainer(POSTGRES_IMAGE).start(),
    new RedisContainer(REDIS_IMAGE).start(),
    startMinio(),
    startMailpit(),
  ]);
  const endpoint = minioEndpoint(minio);
  await createBucket(endpoint);
  return {
    postgres,
    redis,
    minio,
    mailpit,
    env: () => ({
      DATABASE_URL: postgres.getConnectionUri(),
      REDIS_URL: redis.getConnectionUrl(),
      MINIO_ENDPOINT: endpoint,
      MINIO_ACCESS_KEY: MINIO_USER,
      MINIO_SECRET_KEY: MINIO_PASSWORD,
      MINIO_BUCKET: TEST_BUCKET,
      MINIO_REGION: 'us-east-1',
      ...mailpitEnv(mailpit),
    }),
    stopAll: async () => {
      await Promise.all([postgres.stop(), redis.stop(), minio.stop(), mailpit.stop()]);
    },
  };
};
