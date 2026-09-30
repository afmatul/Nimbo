import {
  completeUploadResponseSchema,
  DOWNLOAD_URL_TTL_SECONDS,
  downloadUrlSchema,
} from '@nimbo/contracts';

import { createStorageHttpApp, otherBytes, sha256, TEST_PART_BYTES } from './storage-http';
import type { StorageClient, StorageHttpApp } from './storage-http';

const SMALL_BYTES = 3000;
const MULTIPART_BYTES = TEST_PART_BYTES + 77_777;
const MS_PER_SECOND = 1000;
/** Holgura entre el reloj de la prueba y el de la API al comparar `expiresAt`. */
const CLOCK_SLACK_MS = 30_000;
const RFC_8187_FILENAME = /filename\*=UTF-8''([^;]+)/;

/**
 * Descarga por HTTP con MinIO real (CA-13, CA-14, CA-15): la API emite una URL firmada de 5 minutos contra el origen
 * de objetos (no el de web/API) y el `GET` a esa URL devuelve los mismos bytes con `attachment` y el nombre del
 * archivo como nombre sugerido.
 */
describe('POST /files/:id/download-url → GET a MinIO (CA-13, CA-14, CA-15)', () => {
  let storage: StorageHttpApp;

  beforeAll(async () => {
    storage = await createStorageHttpApp();
  });

  afterAll(async () => {
    await storage?.close();
  });

  const uploaded = async (client: StorageClient, name: string, bytes: Buffer) => {
    const completed = await client.upload(name, bytes, 'keep_both');
    expect(completed.status).toBe(200);
    return completeUploadResponseSchema.parse(completed.body).file;
  };

  const issue = async (client: StorageClient, fileId: string) => {
    const response = await client.downloadUrl(fileId);
    expect(response.status).toBe(200);
    return downloadUrlSchema.parse(response.body);
  };

  const suggestedName = (disposition: string | null): string => {
    const encoded = RFC_8187_FILENAME.exec(disposition ?? '')?.[1];
    if (encoded === undefined) throw new Error('La respuesta no trae `filename*`');
    return decodeURIComponent(encoded);
  };

  it('CA-13: la URL vale 5 minutos y apunta a un solo objeto en el origen de objetos', async () => {
    const client = await storage.newClient();
    const file = await uploaded(client, 'vigencia.bin', otherBytes(SMALL_BYTES));
    const before = Date.now();

    const { url, expiresAt } = await issue(client, file.id);

    const signed = new URL(url);
    expect(signed.searchParams.get('X-Amz-Expires')).toBe(String(DOWNLOAD_URL_TTL_SECONDS));
    expect(signed.pathname).toContain(file.id);
    const expected = before + DOWNLOAD_URL_TTL_SECONDS * MS_PER_SECOND;
    expect(Math.abs(new Date(expiresAt).getTime() - expected)).toBeLessThan(CLOCK_SLACK_MS);
  });

  it('CA-14: el host de la URL es el de objetos, distinto del de la API, y la respuesta fuerza la descarga', async () => {
    const client = await storage.newClient();
    const file = await uploaded(client, 'pagina.html', Buffer.from('<script>alert(1)</script>'));

    const issued = await client.downloadUrl(file.id);
    const { url } = downloadUrlSchema.parse(issued.body);
    const response = await fetch(url);

    const host = new URL(url).host;
    expect(host).toBe(storage.publicHost);
    expect(host).not.toBe(new URL(issued.request.url).host);
    expect(host).not.toBe(new URL(storage.testApp.env.WEB_PUBLIC_URL).host);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toMatch(/^attachment;/);
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('CA-15: una carga simple se descarga con los mismos bytes y su nombre (con acentos) como sugerido', async () => {
    const client = await storage.newClient();
    const bytes = otherBytes(SMALL_BYTES);
    const file = await uploaded(client, 'Presupuesto año 2026 «final».bin', bytes);

    const response = await fetch((await issue(client, file.id)).url);

    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect(suggestedName(response.headers.get('content-disposition'))).toBe(file.name);
  });

  it('CA-15: una carga por partes se descarga íntegra (SHA-256 igual al original)', async () => {
    const client = await storage.newClient();
    const bytes = otherBytes(MULTIPART_BYTES);
    const file = await uploaded(client, 'grande.bin', bytes);

    const response = await fetch((await issue(client, file.id)).url);

    expect(response.status).toBe(200);
    expect(sha256(Buffer.from(await response.arrayBuffer()))).toBe(sha256(bytes));
  });

  it('CA-15: con «Conservar ambos», el nombre sugerido es el definitivo «(1)»', async () => {
    const client = await storage.newClient();
    await uploaded(client, 'acta.bin', otherBytes(SMALL_BYTES));
    const second = await uploaded(client, 'acta.bin', otherBytes(SMALL_BYTES));

    const response = await fetch((await issue(client, second.id)).url);

    expect(second.name).toBe('acta (1).bin');
    expect(suggestedName(response.headers.get('content-disposition'))).toBe('acta (1).bin');
  });

  it('CA-13: un id inexistente o que no es UUID responde el mismo 404 `STORAGE_NODE_NOT_FOUND`', async () => {
    const client = await storage.newClient();

    const missing = await client.downloadUrl('7b0c4c1e-0000-4000-8000-000000000000');
    const malformed = await client.downloadUrl('no-es-un-uuid');

    for (const response of [missing, malformed]) {
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: 'STORAGE_NODE_NOT_FOUND' });
    }
  });
});
