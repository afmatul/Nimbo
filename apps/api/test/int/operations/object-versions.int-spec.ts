import { resolve } from 'node:path';

import {
  GetBucketLifecycleConfigurationCommand,
  GetBucketVersioningCommand,
} from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';
import { GenericContainer, Network, Wait } from 'testcontainers';
import type { ExecResult, StartedNetwork, StartedTestContainer } from 'testcontainers';

import { buildMinioStorageClients } from '../../../src/modules/storage/infrastructure/minio-storage.adapter';
import type { MinioStorageClients } from '../../../src/modules/storage/infrastructure/minio-storage.adapter';
import { MINIO_IMAGE } from '../setup/containers';

/** La imagen de `minio-init` en `compose.yml`: los comandos `mc` de `respaldos.md` corren con ella (D-6). */
const MC_IMAGE = 'pgsty/mc:RELEASE.2026-09-16T00-00-00Z';
const INIT_SCRIPT_SOURCE = resolve(__dirname, '../../../../../infra/minio/init.sh');
const INIT_SCRIPT_TARGET = '/init.sh';
/** `init.sh` habla con `http://minio:9000`, como en el compose. */
const MINIO_ALIAS = 'minio';
const MINIO_PORT = 9000;
const MINIO_USER = 'nimbo';
const MINIO_PASSWORD = 'nimbo-secret';
const BUCKET = 'nimbo-respaldos';
const REGION = 'us-east-1';
const NONCURRENT_DAYS = 7;

const startMinio = (network: StartedNetwork): Promise<StartedTestContainer> =>
  new GenericContainer(MINIO_IMAGE)
    .withNetwork(network)
    .withNetworkAliases(MINIO_ALIAS)
    .withCommand(['server', '/data'])
    .withEnvironment({ MINIO_ROOT_USER: MINIO_USER, MINIO_ROOT_PASSWORD: MINIO_PASSWORD })
    .withExposedPorts(MINIO_PORT)
    .withWaitStrategy(Wait.forHttp('/minio/health/live', MINIO_PORT))
    .start();

/**
 * El contenedor de `minio-init` sin terminar: se ejecuta `init.sh` y los `mc` del procedimiento dentro. `MC_HOST_local`
 * es el alias que `respaldos.md` pasa a `docker compose run --entrypoint mc minio-init`.
 */
const startMc = (network: StartedNetwork): Promise<StartedTestContainer> =>
  new GenericContainer(MC_IMAGE)
    .withNetwork(network)
    .withEntrypoint(['sleep', 'infinity'])
    .withCopyFilesToContainer([{ source: INIT_SCRIPT_SOURCE, target: INIT_SCRIPT_TARGET }])
    .withEnvironment({
      MINIO_ROOT_USER: MINIO_USER,
      MINIO_ROOT_PASSWORD: MINIO_PASSWORD,
      MINIO_BUCKET: BUCKET,
      MC_HOST_local: `http://${MINIO_USER}:${MINIO_PASSWORD}@${MINIO_ALIAS}:${String(MINIO_PORT)}`,
    })
    .start();

const minioClients = (minio: StartedTestContainer): MinioStorageClients => {
  const endpoint = `http://${minio.getHost()}:${String(minio.getMappedPort(MINIO_PORT))}`;
  return buildMinioStorageClients(
    {
      MINIO_ENDPOINT: endpoint,
      MINIO_ACCESS_KEY: MINIO_USER,
      MINIO_SECRET_KEY: MINIO_PASSWORD,
      MINIO_BUCKET: BUCKET,
      MINIO_REGION: REGION,
    },
    endpoint,
  );
};

/**
 * Contenedores propios (no los de `globalSetup`): la prueba necesita un MinIO nuevo, sin bucket, al que
 * `init.sh` llegue por el nombre `minio` de su red, como en el compose.
 */
describe('versiones de objetos en MinIO (CA-7)', () => {
  let network: StartedNetwork;
  let minio: StartedTestContainer;
  let mc: StartedTestContainer;
  let clients: MinioStorageClients;
  let s3: S3Client;

  beforeAll(async () => {
    network = await new Network().start();
    minio = await startMinio(network);
    mc = await startMc(network);
    clients = minioClients(minio);
    s3 = clients.operations;
  });

  afterAll(async () => {
    clients.operations.destroy();
    clients.signing.destroy();
    await mc.stop();
    await minio.stop();
    await network.stop();
  });

  const runInit = (): Promise<ExecResult> => mc.exec(['/bin/sh', INIT_SCRIPT_TARGET]);

  it('CA-7: tras correr init.sh dos veces, el bucket tiene versionado activo y una sola regla de 7 días', async () => {
    const first = await runInit();
    const second = await runInit();

    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    const versioning = await s3.send(new GetBucketVersioningCommand({ Bucket: BUCKET }));
    expect(versioning.Status).toBe('Enabled');
    const lifecycle = await s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket: BUCKET }));
    expect(lifecycle.Rules).toHaveLength(1);
    expect(lifecycle.Rules?.[0]?.Status).toBe('Enabled');
    expect(lifecycle.Rules?.[0]?.NoncurrentVersionExpiration?.NoncurrentDays).toBe(NONCURRENT_DAYS);
    expect(lifecycle.Rules?.[0]?.Expiration).toBeUndefined();
  });
});
