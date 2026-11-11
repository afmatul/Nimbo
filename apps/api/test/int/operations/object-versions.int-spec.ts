import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { Readable } from 'node:stream';

import {
  DeleteObjectCommand,
  GetBucketLifecycleConfigurationCommand,
  GetBucketVersioningCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';
import { GenericContainer, Network, Wait } from 'testcontainers';
import type { ExecResult, StartedNetwork, StartedTestContainer } from 'testcontainers';

import {
  buildMinioStorageClients,
  MinioStorageAdapter,
} from '../../../src/modules/storage/infrastructure/minio-storage.adapter';
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

/** Una línea de `mc ls --versions --json`: `versionOrdinal` es el `vN` de la salida de texto (el mayor, la vigente). */
interface McVersionEntry {
  readonly versionId: string;
  readonly versionOrdinal: number;
  readonly isDeleteMarker?: boolean;
}

/** La versión `vN` de la lista del procedimiento. */
const ordinal = (versions: readonly McVersionEntry[], n: number): McVersionEntry => {
  const entry = versions.find((version) => version.versionOrdinal === n);
  if (entry === undefined) throw new Error(`no hay versión v${String(n)}`);
  return entry;
};

const readAll = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
};

const newKey = (): string => `u/${randomUUID()}/${randomUUID()}/${randomUUID()}`;

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
describe('versiones de objetos en MinIO (CA-7, CA-8)', () => {
  let network: StartedNetwork;
  let minio: StartedTestContainer;
  let mc: StartedTestContainer;
  let clients: MinioStorageClients;
  let s3: S3Client;
  let adapter: MinioStorageAdapter;

  beforeAll(async () => {
    network = await new Network().start();
    minio = await startMinio(network);
    mc = await startMc(network);
    clients = minioClients(minio);
    s3 = clients.operations;
    adapter = new MinioStorageAdapter(clients, BUCKET);
  });

  afterAll(async () => {
    clients.operations.destroy();
    clients.signing.destroy();
    await mc.stop();
    await minio.stop();
    await network.stop();
  });

  const runInit = (): Promise<ExecResult> => mc.exec(['/bin/sh', INIT_SCRIPT_TARGET]);

  const runMc = async (args: readonly string[]): Promise<string> => {
    const result = await mc.exec(['mc', ...args]);
    expect(result.exitCode).toBe(0);
    return result.stdout;
  };

  const target = (key: string): string => `local/${BUCKET}/${key}`;

  /** Versiones de la clave como las lista el procedimiento (`mc ls --versions`). */
  const mcVersions = async (key: string): Promise<McVersionEntry[]> => {
    const stdout = await runMc(['ls', '--versions', '--json', target(key)]);
    return stdout
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as McVersionEntry);
  };

  const putObject = (key: string, body: Buffer) =>
    s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body }));

  const nimboBytes = async (key: string): Promise<Buffer | null> => {
    const stream = await adapter.getObjectStream(key);
    return stream === null ? null : readAll(stream);
  };

  const sdkVersionCount = async (key: string): Promise<number> => {
    const page = await s3.send(new ListObjectVersionsCommand({ Bucket: BUCKET, Prefix: key }));
    return [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])].filter(
      (entry) => entry.Key === key,
    ).length;
  };

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

  describe('CA-8: recuperar la versión anterior con los comandos `mc` de respaldos.md', () => {
    const ORIGINAL = Buffer.from('contenido original del corpus sintético');
    const OVERWRITE = Buffer.from('contenido que lo pisó fuera de Nimbo');

    beforeAll(async () => {
      expect((await runInit()).exitCode).toBe(0);
    });

    it('CA-8: un objeto sobrescrito con el SDK vuelve a entregar sus bytes originales tras `mc cp --version-id`', async () => {
      const key = newKey();
      await putObject(key, ORIGINAL);
      await putObject(key, OVERWRITE);
      expect(await nimboBytes(key)).toEqual(OVERWRITE);

      const previous = ordinal(await mcVersions(key), 1);
      await runMc(['cp', '--version-id', previous.versionId, target(key), target(key)]);

      expect(await nimboBytes(key)).toEqual(ORIGINAL);
    });

    it('CA-8: un objeto borrado con el SDK vuelve a entregar sus bytes originales tras quitar la marca de borrado', async () => {
      const key = newKey();
      await putObject(key, ORIGINAL);
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
      expect(await nimboBytes(key)).toBeNull();

      const marker = ordinal(await mcVersions(key), 2);
      expect(marker.isDeleteMarker).toBe(true);
      await runMc(['rm', '--version-id', marker.versionId, target(key)]);

      expect(await nimboBytes(key)).toEqual(ORIGINAL);
    });

    it('CA-8: tras `purgeObject` (papelera o poda de Nimbo) no queda ninguna versión que recuperar', async () => {
      const key = newKey();
      await putObject(key, ORIGINAL);
      await putObject(key, OVERWRITE);
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));

      await adapter.purgeObject(key);

      expect(await mcVersions(key)).toEqual([]);
      expect(await sdkVersionCount(key)).toBe(0);
      expect(await nimboBytes(key)).toBeNull();
    });
  });
});
