import {
  completeUploadResponseSchema,
  DOWNLOAD_URL_TTL_SECONDS,
  downloadUrlSchema,
} from '@nimbo/contracts';

import { StoragePreviewFacade } from '../../../src/modules/storage';
import {
  NodeNotFoundError,
  PreviewUnsupportedError,
} from '../../../src/modules/storage/domain/errors';
import { createActor, Role } from '../../../src/shared';
import type { LogLine } from '../setup/log-sink';

import { createStorageHttpApp, otherBytes, textBytes } from './storage-http';
import type { StorageClient, StorageHttpApp } from './storage-http';

const SMALL_BYTES = 2048;
const MS_PER_SECOND = 1000;
/** Holgura entre el reloj de la prueba y el de la API al comparar `expiresAt`. */
const CLOCK_SLACK_MS = 30_000;

/**
 * Entrega de la vista previa con Postgres, Redis y MinIO reales (017 CA-8, CA-11): `StoragePreviewFacade` firma la
 * versión actual con la misma política que la descarga de 005 (`attachment`, `application/octet-stream`,
 * `no-store`, 300 s), sin auditar ni registrar la emisión como descarga; la descarga sigue intacta.
 */
describe('StoragePreviewFacade.issueUrl → GET a MinIO (017 CA-8, CA-11)', () => {
  let storage: StorageHttpApp;
  let facade: StoragePreviewFacade;

  beforeAll(async () => {
    storage = await createStorageHttpApp();
    facade = storage.testApp.app.get(StoragePreviewFacade);
  });

  afterAll(async () => {
    await storage?.close();
  });

  const uploaded = async (client: StorageClient, name: string, bytes: Buffer) => {
    const completed = await client.upload(name, bytes, 'keep_both');
    expect(completed.status).toBe(200);
    return completeUploadResponseSchema.parse(completed.body).file;
  };

  const actorOf = (client: StorageClient) => createActor(client.id, Role.CLIENT);

  const linesWith = (predicate: (line: LogLine) => boolean): LogLine[] =>
    storage.testApp.logs.lines().filter(predicate);

  it('CA-11: la URL vale 300 s, apunta a la versión actual y el GET fuerza la descarga como en 005', async () => {
    const client = await storage.newClient();
    const bytes = textBytes(SMALL_BYTES);
    const file = await uploaded(client, 'notas.txt', bytes);
    const before = Date.now();

    const delivery = await facade.issueUrl(actorOf(client), file.id);
    const response = await fetch(delivery.url);

    const signed = new URL(delivery.url);
    expect(signed.host).toBe(storage.publicHost);
    expect(signed.searchParams.get('X-Amz-Expires')).toBe(String(DOWNLOAD_URL_TTL_SECONDS));
    expect(signed.searchParams.get('response-content-disposition')).toMatch(/^attachment;/);
    expect(signed.searchParams.get('response-content-type')).toBe('application/octet-stream');
    const expected = before + DOWNLOAD_URL_TTL_SECONDS * MS_PER_SECOND;
    expect(Math.abs(delivery.expiresAt.getTime() - expected)).toBeLessThan(CLOCK_SLACK_MS);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toMatch(/^attachment;/);
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect(delivery.file).toMatchObject({
      id: file.id,
      kind: 'texto',
      sizeBytes: BigInt(SMALL_BYTES),
    });
  });

  it('CA-11: la firma de vista y la de descarga apuntan al mismo objeto con la misma política', async () => {
    const client = await storage.newClient();
    const file = await uploaded(client, 'informe.md', textBytes(SMALL_BYTES));

    const preview = new URL((await facade.issueUrl(actorOf(client), file.id)).url);
    const download = new URL(downloadUrlSchema.parse((await client.downloadUrl(file.id)).body).url);

    expect(preview.pathname).toBe(download.pathname);
    for (const param of [
      'response-content-disposition',
      'response-content-type',
      'response-cache-control',
    ]) {
      expect(preview.searchParams.get(param)).toBe(download.searchParams.get(param));
    }
  });

  it('CA-8: la vista no audita ni registra la emisión como descarga; la descarga de 005 sí', async () => {
    const client = await storage.newClient();
    const file = await uploaded(client, 'vista.txt', textBytes(SMALL_BYTES));
    storage.testApp.logs.clear();

    await facade.issueUrl(actorOf(client), file.id);
    const afterPreview = linesWith(
      (line) => line.event === 'audit.record' || line.event === 'download.url_issued',
    );
    await client.downloadUrl(file.id);

    expect(afterPreview).toEqual([]);
    expect(linesWith((line) => line.event === 'audit.record')).toEqual([
      expect.objectContaining({ action: 'file.download_url_issued', resourceId: file.id }),
    ]);
  });

  it('CA-11: un tipo sin vista previa (`otro`) es 422 `STORAGE_PREVIEW_UNSUPPORTED`', async () => {
    const client = await storage.newClient();
    const file = await uploaded(client, 'respaldo.bin', otherBytes(SMALL_BYTES));

    await expect(facade.issueUrl(actorOf(client), file.id)).rejects.toBeInstanceOf(
      PreviewUnsupportedError,
    );
  });

  it('CA-3: el archivo de otra cuenta y uno inexistente son el mismo 404', async () => {
    const owner = await storage.newClient();
    const stranger = await storage.newClient();
    const file = await uploaded(owner, 'privado.txt', textBytes(SMALL_BYTES));

    await expect(facade.issueUrl(actorOf(stranger), file.id)).rejects.toBeInstanceOf(
      NodeNotFoundError,
    );
    await expect(
      facade.issueUrl(actorOf(owner), '7b0c4c1e-0000-4000-8000-000000000000'),
    ).rejects.toBeInstanceOf(NodeNotFoundError);
  });
});
