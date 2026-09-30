import {
  completeUploadResponseSchema,
  downloadUrlSchema,
  initUploadResponseSchema,
} from '@nimbo/contracts';
import type { Response } from 'supertest';

import type { LogLine } from '../setup/log-sink';

import {
  createStorageHttpApp,
  otherBytes,
  TEST_PART_BYTES,
  textBytes,
  uploadBytes,
  uploadRow,
} from './storage-http';
import type { InitBody, StorageClient, StorageHttpApp } from './storage-http';

const SMALL_BYTES = 2048;
const MULTIPART_BYTES = TEST_PART_BYTES + 1_234;
const CORRELATION_HEADER = 'x-correlation-id';
/** Nombres con marcas únicas, para buscarlas en cualquier línea de la bitácora. */
const COMPLETED_NAME = 'Nómina-confidencial-7f3a.bin';
const MULTIPART_NAME = 'Respaldo-privado-9c1e.bin';
const REJECTED_NAME = 'Factura-falsa-4b2d.pdf';
const CONFLICT_NAME = 'Contrato-secreto-2e8f.bin';
const CONTENT_MARK = 'contenido-sensible-5d6a';

/**
 * Auditoría y bitácoras de 005 con la app real y el `LogSink` (CA-20, RNF-17): carga completada, carga rechazada y
 * emisión de URL dejan un `audit.record` con actor, UUID, tamaño y `correlationId`; ninguna línea contiene nombres,
 * contenido, URLs firmadas, firmas, claves de objeto, `details` ni `suggestedName`.
 */
describe('auditoría y bitácoras de carga y descarga (CA-20)', () => {
  let storage: StorageHttpApp;
  let client: StorageClient;
  let completedFileId: string;
  let completedCorrelation: string;
  let multipartFileId: string;
  let rejectedUploadId: string;
  let rejectedCorrelation: string;
  let downloadCorrelation: string;
  const secrets: string[] = [];

  const correlationOf = (response: Response): string => {
    const value = response.headers[CORRELATION_HEADER];
    if (typeof value !== 'string') throw new Error('La respuesta no trae `x-correlation-id`');
    return value;
  };

  const started = async (name: string, bytes: Buffer): Promise<InitBody> => {
    const response = await client.init({ name, sizeBytes: bytes.length });
    const init = initUploadResponseSchema.parse(response.body) as InitBody;
    secrets.push(...(init.mode === 'simple' ? [init.upload.url] : init.parts.map((p) => p.url)));
    secrets.push((await uploadRow(storage.owner, init.uploadId)).clave_objeto);
    await uploadBytes(init, bytes);
    return init;
  };

  beforeAll(async () => {
    storage = await createStorageHttpApp();
    client = await storage.newClient();
    storage.testApp.logs.clear();

    const simple = await started(COMPLETED_NAME, textBytes(SMALL_BYTES, CONTENT_MARK));
    const completed = await client.complete(simple.uploadId);
    completedFileId = completeUploadResponseSchema.parse(completed.body).file.id;
    completedCorrelation = correlationOf(completed);

    const multipart = await started(MULTIPART_NAME, otherBytes(MULTIPART_BYTES));
    const multipartDone = await client.complete(multipart.uploadId);
    multipartFileId = completeUploadResponseSchema.parse(multipartDone.body).file.id;

    const rejected = await started(REJECTED_NAME, textBytes(SMALL_BYTES, CONTENT_MARK));
    rejectedUploadId = rejected.uploadId;
    rejectedCorrelation = correlationOf(await client.complete(rejected.uploadId));

    await client.upload(CONFLICT_NAME, otherBytes(SMALL_BYTES));
    const conflict = await client.init({ name: CONFLICT_NAME, sizeBytes: SMALL_BYTES });
    expect(conflict.status).toBe(409);

    const issued = await client.downloadUrl(completedFileId);
    downloadCorrelation = correlationOf(issued);
    const { url } = downloadUrlSchema.parse(issued.body);
    secrets.push(url, new URL(url).searchParams.get('X-Amz-Signature') ?? url);
  });

  afterAll(async () => {
    await storage?.close();
  });

  const auditRecords = (action: string): LogLine[] =>
    storage.testApp.logs
      .lines()
      .filter((line) => line.event === 'audit.record' && line.action === action);

  it('CA-20: una carga completada audita actor, archivo, tamaño y `correlationId`', () => {
    const records = auditRecords('file.upload_completed');

    expect(records).toContainEqual(
      expect.objectContaining({
        actorId: client.id,
        resourceId: completedFileId,
        attributes: { sizeBytes: SMALL_BYTES, mode: 'simple' },
        correlationId: completedCorrelation,
      }),
    );
    expect(records).toContainEqual(
      expect.objectContaining({
        resourceId: multipartFileId,
        attributes: { sizeBytes: MULTIPART_BYTES, mode: 'multipart' },
      }),
    );
  });

  it('CA-20: una carga rechazada audita la carga y su motivo con `correlationId`', () => {
    expect(auditRecords('file.upload_rejected')).toEqual([
      expect.objectContaining({
        actorId: client.id,
        resourceId: rejectedUploadId,
        attributes: { reason: 'tipo_invalido', mode: 'simple' },
        correlationId: rejectedCorrelation,
      }),
    ]);
  });

  it('CA-20: la emisión de la URL de descarga audita el archivo con `correlationId`', () => {
    expect(auditRecords('file.download_url_issued')).toEqual([
      expect.objectContaining({
        actorId: client.id,
        resourceId: completedFileId,
        correlationId: downloadCorrelation,
      }),
    ]);
  });

  it('CA-20: ninguna línea contiene nombres, contenido, URLs firmadas, firmas ni claves de objeto', () => {
    const dump = JSON.stringify(storage.testApp.logs.lines());

    for (const forbidden of [
      COMPLETED_NAME,
      MULTIPART_NAME,
      REJECTED_NAME,
      CONFLICT_NAME,
      CONTENT_MARK,
      ...secrets,
    ]) {
      expect(dump).not.toContain(forbidden);
    }
    expect(dump).not.toContain('X-Amz-Signature');
    expect(dump).not.toContain(`u/${client.id}/`);
  });

  it('CA-20: la bitácora del 409 no lleva `details` ni `suggestedName`', () => {
    const dump = JSON.stringify(storage.testApp.logs.lines());

    expect(dump).toContain('STORAGE_NAME_CONFLICT');
    expect(dump).not.toContain('suggestedName');
    expect(dump).not.toContain('"details"');
  });
});
