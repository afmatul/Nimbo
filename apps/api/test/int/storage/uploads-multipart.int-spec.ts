import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  ListPartsCommand,
} from '@aws-sdk/client-s3';
import {
  completeUploadResponseSchema,
  initUploadResponseSchema,
  resumeUploadResponseSchema,
} from '@nimbo/contracts';

import {
  countRows,
  createStorageHttpApp,
  otherBytes,
  sha256,
  STORAGE_HTTP_BUCKET,
  TEST_PART_BYTES,
  uploadParts,
  uploadRow,
  usedBytesOf,
} from './storage-http';
import type { StorageClient, StorageHttpApp } from './storage-http';

/** Dos partes completas y una última más corta: por encima del umbral (5 MiB), así que es por partes (CA-2). */
const MULTIPART_BYTES = 2 * TEST_PART_BYTES + 123_457;
const EXPECTED_PARTS = 3;

type MultipartInit = Extract<
  ReturnType<typeof initUploadResponseSchema.parse>,
  { mode: 'multipart' }
>;

/**
 * Carga por partes por HTTP con MinIO real (CA-2, CA-10) y la recuperación de `complete` cuando el multipart ya se
 * cerró (Art. XI): el objeto final es idéntico al original y nunca hay dos `archivo` para una carga.
 */
describe('POST /uploads por partes → PUT de partes a MinIO → complete (CA-2, CA-10)', () => {
  let storage: StorageHttpApp;

  beforeAll(async () => {
    storage = await createStorageHttpApp();
  });

  afterAll(async () => {
    await storage?.close();
  });

  const startMultipart = async (
    client: StorageClient,
    name: string,
    bytes: Buffer,
  ): Promise<MultipartInit> => {
    const started = await client.init({ name, sizeBytes: bytes.length });
    expect(started.status).toBe(201);
    const init = initUploadResponseSchema.parse(started.body);
    if (init.mode !== 'multipart') throw new Error('Se esperaba una carga por partes');
    return init;
  };

  /** Cierra el multipart por fuera de la API, como si el proceso hubiera muerto tras `CompleteMultipartUpload`. */
  const completeOutOfBand = async (uploadId: string): Promise<void> => {
    const row = await uploadRow(storage.owner, uploadId);
    const listed = await storage.s3.send(
      new ListPartsCommand({
        Bucket: STORAGE_HTTP_BUCKET,
        Key: row.clave_objeto,
        UploadId: row.upload_id ?? '',
      }),
    );
    await storage.s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: STORAGE_HTTP_BUCKET,
        Key: row.clave_objeto,
        UploadId: row.upload_id ?? '',
        MultipartUpload: {
          Parts: (listed.Parts ?? []).map((part) => ({
            PartNumber: part.PartNumber,
            ETag: part.ETag,
          })),
        },
      }),
    );
  };

  it('CA-2: sobre el umbral recibe una URL por parte y el objeto final es idéntico al original (SHA-256)', async () => {
    const client = await storage.newClient();
    const bytes = otherBytes(MULTIPART_BYTES);

    const init = await startMultipart(client, 'respaldo.bin', bytes);
    expect(init.totalParts).toBe(EXPECTED_PARTS);
    expect(init.partSizeBytes).toBe(TEST_PART_BYTES);
    expect(init.parts.map((part) => part.partNumber)).toEqual([1, 2, 3]);
    expect(init.parts.every((part) => new URL(part.url).host === storage.publicHost)).toBe(true);
    await uploadParts([...init.parts].reverse(), init.partSizeBytes, bytes);
    const completed = await client.complete(init.uploadId);

    expect(completed.status).toBe(200);
    const { file } = completeUploadResponseSchema.parse(completed.body);
    expect(file).toMatchObject({ name: 'respaldo.bin', sizeBytes: MULTIPART_BYTES, kind: 'otro' });
    const row = await uploadRow(storage.owner, init.uploadId);
    expect(row.estado).toBe('completada');
    expect(sha256(await storage.readObject(row.clave_objeto))).toBe(sha256(bytes));
    expect(await usedBytesOf(storage.owner, client.id)).toBe(BigInt(MULTIPART_BYTES));
  });

  it('CA-10: completar con partes faltantes es 409 y la carga sigue reanudable hasta completarse', async () => {
    const client = await storage.newClient();
    const bytes = otherBytes(MULTIPART_BYTES);
    const init = await startMultipart(client, 'incompleto.bin', bytes);
    await uploadParts(
      init.parts.filter((part) => part.partNumber !== 2),
      init.partSizeBytes,
      bytes,
    );

    const early = await client.complete(init.uploadId);

    expect(early.status).toBe(409);
    expect(early.body).toMatchObject({ code: 'STORAGE_UPLOAD_INCOMPLETE' });
    expect((await uploadRow(storage.owner, init.uploadId)).estado).toBe('activa');
    expect(await countRows(storage.owner, 'archivo', client.id)).toBe(0);

    const resumed = resumeUploadResponseSchema.parse((await client.resume(init.uploadId)).body);
    if (resumed.mode !== 'multipart') throw new Error('Se esperaba una carga por partes');
    expect(resumed.pending.parts.map((part) => part.partNumber)).toEqual([2]);
    await uploadParts(resumed.pending.parts, resumed.pending.partSizeBytes, bytes);
    const completed = await client.complete(init.uploadId);

    expect(completed.status).toBe(200);
    const row = await uploadRow(storage.owner, init.uploadId);
    expect(sha256(await storage.readObject(row.clave_objeto))).toBe(sha256(bytes));
  });

  it('Art. XI: si el multipart ya se cerró (`NoSuchUpload`) y el objeto existe, `complete` lo registra', async () => {
    const client = await storage.newClient();
    const bytes = otherBytes(MULTIPART_BYTES);
    const init = await startMultipart(client, 'recuperado.bin', bytes);
    await uploadParts(init.parts, init.partSizeBytes, bytes);
    await completeOutOfBand(init.uploadId);

    const completed = await client.complete(init.uploadId);

    expect(completed.status).toBe(200);
    const { file } = completeUploadResponseSchema.parse(completed.body);
    expect(file.sizeBytes).toBe(MULTIPART_BYTES);
    expect(await countRows(storage.owner, 'archivo', client.id)).toBe(1);
    expect(await usedBytesOf(storage.owner, client.id)).toBe(BigInt(MULTIPART_BYTES));
  });

  it('Art. XI: si el multipart ya no existe y tampoco el objeto, `complete` es 409 y no registra nada', async () => {
    const client = await storage.newClient();
    const bytes = otherBytes(MULTIPART_BYTES);
    const init = await startMultipart(client, 'perdido.bin', bytes);
    const row = await uploadRow(storage.owner, init.uploadId);
    await storage.s3.send(
      new AbortMultipartUploadCommand({
        Bucket: STORAGE_HTTP_BUCKET,
        Key: row.clave_objeto,
        UploadId: row.upload_id ?? '',
      }),
    );

    const completed = await client.complete(init.uploadId);

    expect(completed.status).toBe(409);
    expect(completed.body).toMatchObject({ code: 'STORAGE_UPLOAD_INCOMPLETE' });
    expect(await countRows(storage.owner, 'archivo', client.id)).toBe(0);
  });

  it('Art. XI: dos `complete` simultáneos dejan un solo archivo y ambos responden ese archivo', async () => {
    const client = await storage.newClient();
    const bytes = otherBytes(MULTIPART_BYTES);
    const init = await startMultipart(client, 'doble-clic.bin', bytes);
    await uploadParts(init.parts, init.partSizeBytes, bytes);

    const responses = await Promise.all([
      client.complete(init.uploadId),
      client.complete(init.uploadId),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const [first, second] = responses.map(
      (response) => completeUploadResponseSchema.parse(response.body).file,
    );
    expect(second).toEqual(first);
    expect(await countRows(storage.owner, 'archivo', client.id)).toBe(1);
    expect(await usedBytesOf(storage.owner, client.id)).toBe(BigInt(MULTIPART_BYTES));
    const row = await uploadRow(storage.owner, init.uploadId);
    expect(sha256(await storage.readObject(row.clave_objeto))).toBe(sha256(bytes));
  });
});
