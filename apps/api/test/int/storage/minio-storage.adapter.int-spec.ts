import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

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
const UPLOAD_TTL_SECONDS = 600;
const DOWNLOAD_TTL_SECONDS = 300;
const SHORT_TTL_SECONDS = 2;
/** Espera tras un TTL de 2 s: la firma tiene resolución de segundos. */
const SHORT_TTL_WAIT_MS = 3_500;
const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;

const minioConfig = (): MinioConfig => ({
  MINIO_ENDPOINT: process.env.MINIO_ENDPOINT ?? '',
  MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY ?? '',
  MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY ?? '',
  MINIO_BUCKET: BUCKET,
  MINIO_REGION: process.env.MINIO_REGION ?? 'us-east-1',
});

/**
 * El mismo MinIO con otro nombre de host: así se distingue el endpoint público (el que firma) del interno. Solo el
 * público aparece en las URLs.
 */
const publicAlias = (endpoint: string): string => {
  const url = new URL(endpoint);
  url.hostname = url.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
  return url.origin;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const newKey = (): string => `u/${randomUUID()}/${randomUUID()}/${randomUUID()}`;

const readAll = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
};

describe('MinioStorageAdapter contra MinIO real (CA-2, CA-5, CA-11, CA-13, CA-14)', () => {
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
    clients = buildMinioStorageClients(config, publicAlias(config.MINIO_ENDPOINT));
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

  it('014 CA-9: `copyObject` copia los bytes en el servidor, deja el origen intacto y repetirla es idempotente', async () => {
    const source = newKey();
    const target = newKey();
    await putObject(source, Buffer.from('contenido de la versión 1'));

    await expect(adapter.copyObject(source, target)).resolves.toBe(true);
    await expect(adapter.copyObject(source, target)).resolves.toBe(true);

    await expect(adapter.getRange(target, 0, 24)).resolves.toEqual(
      Buffer.from('contenido de la versión 1').subarray(0, 25),
    );
    await expect(adapter.headObject(source)).resolves.toEqual(await adapter.headObject(target));
    await adapter.purgeObject(source);
    await adapter.purgeObject(target);
  });

  it('014 plan §7: `copyObject` de un origen inexistente devuelve `false` y no crea el destino', async () => {
    const target = newKey();

    await expect(adapter.copyObject(newKey(), target)).resolves.toBe(false);
    await expect(adapter.headObject(target)).resolves.toBeNull();
  });

  it('016 CA-9: `putObject` sube un flujo con su tamaño y `getObjectStream` lo devuelve completo', async () => {
    const key = newKey();
    const content = Buffer.alloc(3 * 1024 * 1024 + 7, 'documento editado ');

    await adapter.putObject(key, Readable.from([content]), BigInt(content.length));
    const stream = await adapter.getObjectStream(key);

    expect(stream).not.toBeNull();
    await expect(readAll(stream as Readable)).resolves.toEqual(content);
    await expect(adapter.headObject(key)).resolves.toEqual({ sizeBytes: BigInt(content.length) });
    await adapter.purgeObject(key);
  });

  it('016 CA-2: `getObjectStream` de un objeto ausente devuelve `null`', async () => {
    await expect(adapter.getObjectStream(newKey())).resolves.toBeNull();
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
    await expect(adapter.completeMultipart(key, uploadId, parts ?? [])).resolves.toBe(true);

    await expect(adapter.headObject(key)).resolves.toEqual({
      sizeBytes: BigInt(MIN_PART_BYTES + last.length),
    });
    await expect(adapter.listParts(key, uploadId)).resolves.toBeNull();
    await adapter.purgeObject(key);
  });

  it('Art. XI: completar otra vez una carga por partes ya cerrada devuelve `false` (`NoSuchUpload`)', async () => {
    const key = newKey();
    const uploadId = await adapter.createMultipart(key);
    await uploadPart(key, uploadId, 1, Buffer.from('única'));
    const parts = (await adapter.listParts(key, uploadId)) ?? [];
    await adapter.completeMultipart(key, uploadId, parts);

    await expect(adapter.completeMultipart(key, uploadId, parts)).resolves.toBe(false);
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

  it('CA-2: la URL de carga simple apunta al endpoint público y acepta el `PUT` con el tamaño firmado', async () => {
    const key = newKey();
    const body = Buffer.from('contenido firmado');
    const url = await adapter.presignUploadObject({
      key,
      contentLength: BigInt(body.length),
      expiresInSeconds: UPLOAD_TTL_SECONDS,
    });

    expect(new URL(url).origin).toBe(publicAlias(minioConfig().MINIO_ENDPOINT));
    expect(new URL(url).origin).not.toBe(new URL(minioConfig().MINIO_ENDPOINT).origin);
    const response = await fetch(url, { method: 'PUT', body });

    expect(response.status).toBe(HTTP_OK);
    await expect(adapter.headObject(key)).resolves.toEqual({ sizeBytes: BigInt(body.length) });
    await adapter.purgeObject(key);
  });

  it('CA-2: un `PUT` con un `Content-Length` distinto del firmado se rechaza y no crea el objeto', async () => {
    const key = newKey();
    const url = await adapter.presignUploadObject({
      key,
      contentLength: 10n,
      expiresInSeconds: UPLOAD_TTL_SECONDS,
    });

    const response = await fetch(url, { method: 'PUT', body: Buffer.alloc(11, 0x61) });

    expect(response.status).toBe(HTTP_FORBIDDEN);
    await expect(adapter.headObject(key)).resolves.toBeNull();
  });

  it('CA-2: la URL de una parte sube esa parte; `listParts` la ve con su tamaño', async () => {
    const key = newKey();
    const part = Buffer.from('parte uno');
    const uploadId = await adapter.createMultipart(key);
    const url = await adapter.presignUploadPart({
      key,
      uploadId,
      partNumber: 1,
      contentLength: BigInt(part.length),
      expiresInSeconds: UPLOAD_TTL_SECONDS,
    });

    const response = await fetch(url, { method: 'PUT', body: part });

    expect(response.status).toBe(HTTP_OK);
    const parts = await adapter.listParts(key, uploadId);
    expect(parts?.map((entry) => [entry.partNumber, entry.sizeBytes])).toEqual([
      [1, BigInt(part.length)],
    ]);
    await adapter.abortMultipart(key, uploadId);
  });

  it('CA-13: la descarga devuelve los mismos bytes con `attachment`, `octet-stream` y `no-store`', async () => {
    const key = newKey();
    const body = Buffer.from('bytes idénticos');
    await putObject(key, body);
    const url = await adapter.presignDownload({
      key,
      fileName: 'Informe año.docx',
      expiresInSeconds: DOWNLOAD_TTL_SECONDS,
    });

    const response = await fetch(url);

    expect(response.status).toBe(HTTP_OK);
    expect(response.headers.get('content-disposition')).toBe(
      "attachment; filename*=UTF-8''Informe%20a%C3%B1o.docx",
    );
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(body);
    await adapter.purgeObject(key);
  });

  it('CA-14: la URL de descarga solo autoriza su clave (la misma firma sobre otra clave falla)', async () => {
    const key = newKey();
    const otherKey = newKey();
    await putObject(key, 'propio');
    await putObject(otherKey, 'ajeno');
    const url = new URL(
      await adapter.presignDownload({
        key,
        fileName: 'a.txt',
        expiresInSeconds: DOWNLOAD_TTL_SECONDS,
      }),
    );
    url.pathname = `/${BUCKET}/${otherKey}`;

    const response = await fetch(url);

    expect(response.status).toBe(HTTP_FORBIDDEN);
    await adapter.purgeObject(key);
    await adapter.purgeObject(otherKey);
  });

  it('CA-14: una URL de descarga vencida (TTL de 2 s) se rechaza', async () => {
    const key = newKey();
    await putObject(key, 'caduca');
    const url = await adapter.presignDownload({
      key,
      fileName: 'a.txt',
      expiresInSeconds: SHORT_TTL_SECONDS,
    });
    expect((await fetch(url)).status).toBe(HTTP_OK);

    await sleep(SHORT_TTL_WAIT_MS);

    expect((await fetch(url)).status).toBe(HTTP_FORBIDDEN);
    await adapter.purgeObject(key);
  });
});
