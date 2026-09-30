import { randomUUID } from 'node:crypto';

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  ListObjectVersionsCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';

import {
  buildMinioStorageClients,
  INTERNAL_CONNECT_TIMEOUT_MS,
  MinioStorageAdapter,
} from '../../../src/modules/storage/infrastructure/minio-storage.adapter';
import type { MinioStorageClients } from '../../../src/modules/storage/infrastructure/minio-storage.adapter';
import type { MinioConfig } from '../../../src/shared';

/** Bucket propio y versionado, como el de `infra/minio/init.sh`: el de pruebas compartido no tiene versionado. */
const BUCKET = 'nimbo-storage-adapter';
const MIN_PART_BYTES = 5 * 1024 * 1024;
/** `ListParts` devuelve como mucho 1000 partes por página: 1001 obliga a paginar. */
const PARTS_BEYOND_ONE_PAGE = 1001;
const PART_UPLOAD_CONCURRENCY = 50;
/** Dirección no enrutable: la conexión nunca se establece y solo la corta `connectTimeout`. */
const BLACKHOLE_ENDPOINT = 'http://10.255.255.1:9000';
const CONNECT_TIMEOUT_MARGIN_MS = 1_500;

const minioConfig = (): MinioConfig => ({
  MINIO_ENDPOINT: process.env.MINIO_ENDPOINT ?? '',
  MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY ?? '',
  MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY ?? '',
  MINIO_BUCKET: BUCKET,
  MINIO_REGION: process.env.MINIO_REGION ?? 'us-east-1',
});

const newKey = (): string => `u/${randomUUID()}/${randomUUID()}/${randomUUID()}`;

describe('MinioStorageAdapter contra MinIO real (CA-5, CA-11)', () => {
  let clients: MinioStorageClients;
  let s3: S3Client;
  let adapter: MinioStorageAdapter;

  const putObject = (key: string, body: Buffer | string) =>
    s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body }));

  const versionsOf = async (key: string): Promise<number> => {
    const page = await s3.send(new ListObjectVersionsCommand({ Bucket: BUCKET, Prefix: key }));
    return [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])].filter(
      (entry) => entry.Key === key,
    ).length;
  };

  const uploadPart = (key: string, uploadId: string, partNumber: number, body: Buffer) =>
    s3.send(
      new UploadPartCommand({
        Bucket: BUCKET,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: body,
      }),
    );

  beforeAll(async () => {
    const config = minioConfig();
    clients = buildMinioStorageClients(config, config.MINIO_ENDPOINT);
    s3 = clients.operations;
    adapter = new MinioStorageAdapter(clients, BUCKET);
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    await s3.send(
      new PutBucketVersioningCommand({
        Bucket: BUCKET,
        VersioningConfiguration: { Status: 'Enabled' },
      }),
    );
  });

  afterAll(() => {
    clients.operations.destroy();
    clients.signing.destroy();
  });

  it('CA-11: `purgeObject` borra todas las versiones y marcas de borrado, y no toca otras claves', async () => {
    const key = newKey();
    const neighbour = `${key}-vecina`;
    await putObject(key, 'uno');
    await putObject(key, 'dos');
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    await putObject(neighbour, 'vecina');
    expect(await versionsOf(key)).toBe(3);

    await adapter.purgeObject(key);

    expect(await versionsOf(key)).toBe(0);
    expect(await versionsOf(neighbour)).toBe(1);
    await adapter.purgeObject(neighbour);
  });

  it('CA-11: `purgeObject` de una clave inexistente no falla (idempotente)', async () => {
    await expect(adapter.purgeObject(newKey())).resolves.toBeUndefined();
  });

  it('CA-5: `headObject` devuelve el tamaño y `getRange` el rango inclusivo; ausente → `null`', async () => {
    const key = newKey();
    await putObject(key, Buffer.from('0123456789'));

    await expect(adapter.headObject(key)).resolves.toEqual({ sizeBytes: 10n });
    await expect(adapter.getRange(key, 2, 5)).resolves.toEqual(Buffer.from('2345'));
    await expect(adapter.headObject(newKey())).resolves.toBeNull();
    await adapter.purgeObject(key);
  });

  it('CA-5: por partes: crear, listar con tamaños reales, completar y leer el objeto resultante', async () => {
    const key = newKey();
    const first = Buffer.alloc(MIN_PART_BYTES, 0x61);
    const last = Buffer.from('fin');
    const uploadId = await adapter.createMultipart(key);
    await uploadPart(key, uploadId, 1, first);
    await uploadPart(key, uploadId, 2, last);

    const parts = await adapter.listParts(key, uploadId);
    expect(parts?.map((part) => [part.partNumber, part.sizeBytes])).toEqual([
      [1, BigInt(MIN_PART_BYTES)],
      [2, 3n],
    ]);
    await adapter.completeMultipart(key, uploadId, parts ?? []);

    await expect(adapter.headObject(key)).resolves.toEqual({
      sizeBytes: BigInt(MIN_PART_BYTES + last.length),
    });
    await expect(adapter.listParts(key, uploadId)).resolves.toBeNull();
    await adapter.purgeObject(key);
  });

  it('CA-5: `listParts` pagina más allá de 1000 partes', async () => {
    const key = newKey();
    const uploadId = await adapter.createMultipart(key);
    const numbers = Array.from({ length: PARTS_BEYOND_ONE_PAGE }, (_, index) => index + 1);
    for (let start = 0; start < numbers.length; start += PART_UPLOAD_CONCURRENCY) {
      await Promise.all(
        numbers
          .slice(start, start + PART_UPLOAD_CONCURRENCY)
          .map((partNumber) => uploadPart(key, uploadId, partNumber, Buffer.from('x'))),
      );
    }

    const parts = await adapter.listParts(key, uploadId);

    expect(parts?.map((part) => part.partNumber)).toEqual(numbers);
    await adapter.abortMultipart(key, uploadId);
  });

  it('CA-11: `abortMultipart` descarta las partes y tolera `NoSuchUpload` al repetirse', async () => {
    const key = newKey();
    const uploadId = await adapter.createMultipart(key);
    await uploadPart(key, uploadId, 1, Buffer.from('parte'));

    await adapter.abortMultipart(key, uploadId);

    await expect(adapter.listParts(key, uploadId)).resolves.toBeNull();
    await expect(adapter.abortMultipart(key, uploadId)).resolves.toBeUndefined();
    await expect(adapter.headObject(key)).resolves.toBeNull();
  });

  it('CA-5: el cliente interno corta la conexión a los ~2 s (MinIO inalcanzable no retiene la transacción)', async () => {
    const unreachable = buildMinioStorageClients(
      { ...minioConfig(), MINIO_ENDPOINT: BLACKHOLE_ENDPOINT },
      BLACKHOLE_ENDPOINT,
    );
    const slowAdapter = new MinioStorageAdapter(unreachable, BUCKET);
    const started = performance.now();

    await expect(slowAdapter.createMultipart(newKey())).rejects.toThrow();

    expect(performance.now() - started).toBeLessThan(
      INTERNAL_CONNECT_TIMEOUT_MS + CONNECT_TIMEOUT_MARGIN_MS,
    );
    unreachable.operations.destroy();
    unreachable.signing.destroy();
  });
});
