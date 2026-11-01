import { Readable } from 'node:stream';

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  ListPartsCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import {
  buildMinioStorageClients,
  MinioStorageAdapter,
  STREAM_UPLOAD_SLICE_BYTES,
} from './minio-storage.adapter';
import type { MinioStorageClients } from './minio-storage.adapter';

const BUCKET = 'nimbo-test';
const KEY = 'u/owner-1/file-1/version-1';
const VERSION_KEY =
  'u/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333';
const UPLOAD_ID = 'upload-abc';

type Input = Record<string, unknown>;
type Handler = (input: Input) => unknown;
interface SentCommand {
  readonly constructor: { readonly name: string };
  readonly input: Input;
}

/** Cliente S3 falso: responde por nombre de comando y guarda cada llamada. */
const fakeClient = (handlers: Record<string, Handler>) => {
  const calls: { command: string; input: Input }[] = [];
  const send = jest.fn((command: SentCommand) => {
    const name = command.constructor.name;
    calls.push({ command: name, input: command.input });
    const handler = handlers[name];
    if (handler === undefined) {
      return Promise.reject(new Error(`comando no esperado: ${name}`));
    }
    try {
      return Promise.resolve(handler(command.input));
    } catch (error: unknown) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
  return { client: { send } as unknown as S3Client, calls };
};

const s3Error = (name: string, httpStatusCode: number): Error =>
  Object.assign(new Error(name), { name, $metadata: { httpStatusCode } });

const signingClient = new S3Client({ region: 'us-east-1' });

const buildAdapter = (handlers: Record<string, Handler>) => {
  const { client, calls } = fakeClient(handlers);
  return {
    calls,
    adapter: new MinioStorageAdapter({ operations: client, signing: signingClient }, BUCKET),
  };
};

const throwing =
  (name: string, httpStatusCode: number): Handler =>
  () => {
    throw s3Error(name, httpStatusCode);
  };

describe('MinioStorageAdapter (operaciones, cliente falso)', () => {
  afterAll(() => {
    signingClient.destroy();
  });

  it('CA-5: `createMultipart` abre la carga en el bucket y devuelve su `uploadId`', async () => {
    const { adapter, calls } = buildAdapter({
      [CreateMultipartUploadCommand.name]: () => ({ UploadId: UPLOAD_ID }),
    });

    await expect(adapter.createMultipart(KEY)).resolves.toBe(UPLOAD_ID);
    expect(calls[0]?.input).toEqual({ Bucket: BUCKET, Key: KEY });
  });

  it('CA-5: `createMultipart` falla si el almacenamiento no devuelve `uploadId`', async () => {
    const { adapter } = buildAdapter({ [CreateMultipartUploadCommand.name]: () => ({}) });

    await expect(adapter.createMultipart(KEY)).rejects.toThrow();
  });

  it('CA-5: `listParts` recorre todas las páginas y devuelve número, tamaño en bigint y ETag', async () => {
    const { adapter, calls } = buildAdapter({
      [ListPartsCommand.name]: (input) =>
        input.PartNumberMarker === undefined
          ? {
              IsTruncated: true,
              NextPartNumberMarker: '1',
              Parts: [{ PartNumber: 1, Size: 8, ETag: '"e1"' }],
            }
          : { IsTruncated: false, Parts: [{ PartNumber: 2, Size: 3, ETag: '"e2"' }] },
    });

    await expect(adapter.listParts(KEY, UPLOAD_ID)).resolves.toEqual([
      { partNumber: 1, sizeBytes: 8n, etag: '"e1"' },
      { partNumber: 2, sizeBytes: 3n, etag: '"e2"' },
    ]);
    expect(calls.map((call) => call.input.PartNumberMarker)).toEqual([undefined, '1']);
    expect(calls[0]?.input).toMatchObject({ Bucket: BUCKET, Key: KEY, UploadId: UPLOAD_ID });
  });

  it('CA-5: `listParts` devuelve `null` si la carga por partes ya no existe (`NoSuchUpload`)', async () => {
    const { adapter } = buildAdapter({ [ListPartsCommand.name]: throwing('NoSuchUpload', 404) });

    await expect(adapter.listParts(KEY, UPLOAD_ID)).resolves.toBeNull();
  });

  it('Art. XI: `completeMultipart` devuelve `false` si la carga por partes ya se cerró (`NoSuchUpload`)', async () => {
    const { adapter } = buildAdapter({
      [CompleteMultipartUploadCommand.name]: throwing('NoSuchUpload', 404),
    });

    await expect(adapter.completeMultipart(KEY, UPLOAD_ID, [])).resolves.toBe(false);
  });

  it('CA-5: `completeMultipart` envía las partes en orden con su ETag', async () => {
    const { adapter, calls } = buildAdapter({ [CompleteMultipartUploadCommand.name]: () => ({}) });

    const completed = await adapter.completeMultipart(KEY, UPLOAD_ID, [
      { partNumber: 2, sizeBytes: 3n, etag: '"e2"' },
      { partNumber: 1, sizeBytes: 8n, etag: '"e1"' },
    ]);

    expect(completed).toBe(true);

    expect(calls[0]?.input).toEqual({
      Bucket: BUCKET,
      Key: KEY,
      UploadId: UPLOAD_ID,
      MultipartUpload: {
        Parts: [
          { PartNumber: 1, ETag: '"e1"' },
          { PartNumber: 2, ETag: '"e2"' },
        ],
      },
    });
  });

  it('CA-11: `abortMultipart` tolera `NoSuchUpload` y propaga cualquier otro fallo', async () => {
    const tolerant = buildAdapter({
      [AbortMultipartUploadCommand.name]: throwing('NoSuchUpload', 404),
    });
    const failing = buildAdapter({
      [AbortMultipartUploadCommand.name]: throwing('InternalError', 500),
    });

    await expect(tolerant.adapter.abortMultipart(KEY, UPLOAD_ID)).resolves.toBeUndefined();
    await expect(failing.adapter.abortMultipart(KEY, UPLOAD_ID)).rejects.toThrow('InternalError');
  });

  it('CA-5: `headObject` devuelve el tamaño en bigint, o `null` si el objeto no existe', async () => {
    const present = buildAdapter({ [HeadObjectCommand.name]: () => ({ ContentLength: 11 }) });
    const absent = buildAdapter({ [HeadObjectCommand.name]: throwing('NotFound', 404) });

    await expect(present.adapter.headObject(KEY)).resolves.toEqual({ sizeBytes: 11n });
    await expect(absent.adapter.headObject(KEY)).resolves.toBeNull();
  });

  it('CA-5: `headObject` propaga un fallo que no es «no existe»', async () => {
    const { adapter } = buildAdapter({ [HeadObjectCommand.name]: throwing('InternalError', 500) });

    await expect(adapter.headObject(KEY)).rejects.toThrow('InternalError');
  });

  it('014 CA-9: `copyObject` copia en el servidor del origen al destino dentro del mismo bucket', async () => {
    const target = 'u/owner-1/file-1/version-2';
    const { adapter, calls } = buildAdapter({ [CopyObjectCommand.name]: () => ({}) });

    await expect(adapter.copyObject(KEY, target)).resolves.toBe(true);
    expect(calls).toEqual([
      {
        command: CopyObjectCommand.name,
        input: { Bucket: BUCKET, Key: target, CopySource: `${BUCKET}/${KEY}` },
      },
    ]);
  });

  it('014 plan §7: `copyObject` devuelve `false` si el origen ya no existe (`NoSuchKey`)', async () => {
    const { adapter } = buildAdapter({ [CopyObjectCommand.name]: throwing('NoSuchKey', 404) });

    await expect(adapter.copyObject(KEY, 'u/owner-1/file-1/version-2')).resolves.toBe(false);
  });

  it('014 CA-9: `copyObject` propaga un fallo que no es «no existe»', async () => {
    const { adapter } = buildAdapter({ [CopyObjectCommand.name]: throwing('InternalError', 500) });

    await expect(adapter.copyObject(KEY, 'u/owner-1/file-1/version-2')).rejects.toThrow(
      'InternalError',
    );
  });

  it('CA-12: `getRange` pide el rango inclusivo y devuelve los bytes', async () => {
    const { adapter, calls } = buildAdapter({
      [GetObjectCommand.name]: () => ({
        Body: { transformToByteArray: () => Promise.resolve(Uint8Array.from([1, 2, 3])) },
      }),
    });

    await expect(adapter.getRange(KEY, 4, 6)).resolves.toEqual(Buffer.from([1, 2, 3]));
    expect(calls[0]?.input).toEqual({ Bucket: BUCKET, Key: KEY, Range: 'bytes=4-6' });
  });

  it('CA-11: `purgeObject` borra todas las versiones y marcas de la clave exacta, página a página', async () => {
    const { adapter, calls } = buildAdapter({
      [ListObjectVersionsCommand.name]: (input) =>
        input.KeyMarker === undefined
          ? {
              IsTruncated: true,
              NextKeyMarker: KEY,
              NextVersionIdMarker: 'v2',
              Versions: [
                { Key: KEY, VersionId: 'v1' },
                { Key: `${KEY}-otra`, VersionId: 'x1' },
              ],
              DeleteMarkers: [{ Key: KEY, VersionId: 'm1' }],
            }
          : { IsTruncated: false, Versions: [{ Key: KEY, VersionId: 'v2' }] },
      [DeleteObjectsCommand.name]: () => ({}),
    });

    await adapter.purgeObject(KEY);

    const listInputs = calls
      .filter((call) => call.command === ListObjectVersionsCommand.name)
      .map((call) => call.input);
    expect(listInputs).toEqual([
      expect.objectContaining({ Bucket: BUCKET, Prefix: KEY, KeyMarker: undefined }),
      expect.objectContaining({
        Bucket: BUCKET,
        Prefix: KEY,
        KeyMarker: KEY,
        VersionIdMarker: 'v2',
      }),
    ]);
    const deleted = calls
      .filter((call) => call.command === DeleteObjectsCommand.name)
      .flatMap((call) => (call.input.Delete as { Objects: unknown[] }).Objects);
    expect(deleted).toEqual([
      { Key: KEY, VersionId: 'v1' },
      { Key: KEY, VersionId: 'm1' },
      { Key: KEY, VersionId: 'v2' },
    ]);
  });

  it('CA-11: `purgeObject` sin versiones no borra nada (idempotente)', async () => {
    const { adapter, calls } = buildAdapter({
      [ListObjectVersionsCommand.name]: () => ({ IsTruncated: false }),
    });

    await adapter.purgeObject(KEY);

    expect(calls.map((call) => call.command)).toEqual([ListObjectVersionsCommand.name]);
  });

  it('CA-11: `purgeObject` falla si el almacenamiento informa errores por objeto', async () => {
    const { adapter } = buildAdapter({
      [ListObjectVersionsCommand.name]: () => ({ Versions: [{ Key: KEY, VersionId: 'v1' }] }),
      [DeleteObjectsCommand.name]: () => ({ Errors: [{ Key: KEY, Code: 'AccessDenied' }] }),
    });

    await expect(adapter.purgeObject(KEY)).rejects.toThrow();
  });

  it('009 CA-6: `putObject` sube la factura con su tipo de contenido', async () => {
    const { adapter, calls } = buildAdapter({ PutObjectCommand: () => ({}) });
    const key =
      'invoices/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.pdf';

    await adapter.putObject({ key, body: Buffer.from('%PDF-'), contentType: 'application/pdf' });

    expect(calls).toEqual([
      {
        command: 'PutObjectCommand',
        input: {
          Bucket: BUCKET,
          Key: key,
          Body: Buffer.from('%PDF-'),
          ContentType: 'application/pdf',
        },
      },
    ]);
  });

  it.each([KEY, 'invoices/otra-cosa.pdf', 'invoices/11111111-1111-4111-8111-111111111111/x.exe'])(
    '009 I-1: `putObject` rechaza la clave %s sin llamar al almacenamiento (solo facturas)',
    async (key) => {
      const { adapter, calls } = buildAdapter({});

      await expect(
        adapter.putObject({ key, body: Buffer.from('x'), contentType: 'application/pdf' }),
      ).rejects.toThrow(/invoices\//);
      expect(calls).toEqual([]);
    },
  );

  it('016 CA-9: `putObjectStream` sube el flujo a la clave de la versión con su tamaño', async () => {
    const { adapter, calls } = buildAdapter({ PutObjectCommand: () => ({}) });

    await adapter.putObjectStream(VERSION_KEY, Readable.from([Buffer.from('docx')]), 4n);

    expect(calls).toEqual([
      {
        command: 'PutObjectCommand',
        input: { Bucket: BUCKET, Key: VERSION_KEY, Body: expect.any(Readable), ContentLength: 4 },
      },
    ]);
    const sent = calls[0]?.input.Body as Readable;
    expect(Buffer.concat(await sent.toArray())).toEqual(Buffer.from('docx'));
  });

  it('021 T-08: `putObjectStream` re-entrega un trozo grande en vistas de 1 MiB, con los mismos bytes', async () => {
    const { adapter, calls } = buildAdapter({ PutObjectCommand: () => ({}) });
    const content = Buffer.alloc(STREAM_UPLOAD_SLICE_BYTES * 2 + 5, 7);

    await adapter.putObjectStream(VERSION_KEY, Readable.from([content]), BigInt(content.length));

    const chunks = (await (calls[0]?.input.Body as Readable).toArray()) as Buffer[];
    expect(chunks.map((chunk) => chunk.length)).toEqual([
      STREAM_UPLOAD_SLICE_BYTES,
      STREAM_UPLOAD_SLICE_BYTES,
      5,
    ]);
    expect(Buffer.concat(chunks).equals(content)).toBe(true);
    expect(calls[0]?.input.ContentLength).toBe(content.length);
  });

  it.each([
    'invoices/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.pdf',
    KEY,
    `${VERSION_KEY}/extra`,
    VERSION_KEY.replace(/1/g, 'A'),
  ])(
    '016 SEC-3: `putObjectStream` rechaza la clave %s sin llamar al almacenamiento (solo versiones)',
    async (key) => {
      const { adapter, calls } = buildAdapter({});

      await expect(
        adapter.putObjectStream(key, Readable.from([Buffer.from('x')]), 1n),
      ).rejects.toThrow(/u\/\{propietario\}/);
      expect(calls).toEqual([]);
    },
  );

  it('016 CA-9: `getObjectStream` devuelve el flujo del cuerpo', async () => {
    const body = Readable.from([Buffer.from('docx')]);
    const { adapter } = buildAdapter({ [GetObjectCommand.name]: () => ({ Body: body }) });

    await expect(adapter.getObjectStream(VERSION_KEY)).resolves.toBe(body);
  });

  it('016 S-2: `getObjectStream` falla si el cuerpo no es un flujo (nunca un documento vacío)', async () => {
    const { adapter } = buildAdapter({ [GetObjectCommand.name]: () => ({}) });

    await expect(adapter.getObjectStream(VERSION_KEY)).rejects.toThrow(/flujo/);
  });

  it('016 CA-2: `getObjectStream` de un objeto ausente devuelve `null`', async () => {
    const { adapter } = buildAdapter({ [GetObjectCommand.name]: throwing('NoSuchKey', 404) });

    await expect(adapter.getObjectStream(VERSION_KEY)).resolves.toBeNull();
  });
});

describe('MinioStorageAdapter (firmas, cómputo local)', () => {
  const PUBLIC_ENDPOINT = 'https://s3.staging.nimbo.me';
  const INTERNAL_ENDPOINT = 'http://minio:9000';
  const TTL_SECONDS = 3600;
  const config = {
    MINIO_ENDPOINT: INTERNAL_ENDPOINT,
    MINIO_ACCESS_KEY: 'nimbo',
    MINIO_SECRET_KEY: 'nimbo-secret',
    MINIO_BUCKET: BUCKET,
    MINIO_REGION: 'us-east-1',
  };
  let clients: MinioStorageClients;
  let operations: jest.SpyInstance;
  let adapter: MinioStorageAdapter;

  beforeAll(() => {
    clients = buildMinioStorageClients(config, PUBLIC_ENDPOINT);
    operations = jest.spyOn(clients.operations, 'send');
    adapter = new MinioStorageAdapter(clients, BUCKET);
  });

  afterAll(() => {
    clients.operations.destroy();
    clients.signing.destroy();
  });

  const signedHeaders = (url: URL): string[] =>
    (url.searchParams.get('X-Amz-SignedHeaders') ?? '').split(';');

  it('CA-2: la URL de carga simple se firma contra el endpoint público, con `Content-Length` firmado', async () => {
    const url = new URL(
      await adapter.presignUploadObject({
        key: KEY,
        contentLength: 1234n,
        expiresInSeconds: TTL_SECONDS,
      }),
    );

    expect(url.origin).toBe(PUBLIC_ENDPOINT);
    expect(url.pathname).toBe(`/${BUCKET}/${KEY}`);
    expect(signedHeaders(url)).toEqual(expect.arrayContaining(['content-length', 'host']));
    expect(url.searchParams.get('X-Amz-Expires')).toBe(String(TTL_SECONDS));
    expect([...url.searchParams.keys()].filter((name) => name.includes('checksum'))).toEqual([]);
  });

  it('CA-2: la URL de una parte lleva `uploadId` y `partNumber` y firma su `Content-Length`', async () => {
    const url = new URL(
      await adapter.presignUploadPart({
        key: KEY,
        uploadId: UPLOAD_ID,
        partNumber: 3,
        contentLength: 8n,
        expiresInSeconds: TTL_SECONDS,
      }),
    );

    expect(url.origin).toBe(PUBLIC_ENDPOINT);
    expect(url.searchParams.get('uploadId')).toBe(UPLOAD_ID);
    expect(url.searchParams.get('partNumber')).toBe('3');
    expect(signedHeaders(url)).toContain('content-length');
  });

  it('CA-13: la URL de descarga dura lo pedido y fuerza `attachment`, `octet-stream` y `no-store`', async () => {
    const url = new URL(
      await adapter.presignDownload({
        key: KEY,
        fileName: "Informe año (1)'s*.docx",
        expiresInSeconds: 300,
      }),
    );

    expect(url.origin).toBe(PUBLIC_ENDPOINT);
    expect(url.pathname).toBe(`/${BUCKET}/${KEY}`);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('response-content-disposition')).toBe(
      "attachment; filename*=UTF-8''Informe%20a%C3%B1o%20%281%29%27s%2A.docx",
    );
    expect(url.searchParams.get('response-content-type')).toBe('application/octet-stream');
    expect(url.searchParams.get('response-cache-control')).toBe('no-store');
  });

  it('CA-14: firmar no usa el cliente interno (no hay red)', async () => {
    await adapter.presignUploadObject({ key: KEY, contentLength: 1n, expiresInSeconds: 60 });
    await adapter.presignDownload({ key: KEY, fileName: 'a.txt', expiresInSeconds: 60 });

    expect(operations).not.toHaveBeenCalled();
  });
});
