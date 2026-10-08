import { initUploadResponseSchema } from '@nimbo/contracts';

import { createStorageHttpApp, textBytes, uploadBytes, usedBytesOf } from './storage-http';
import type { InitBody, StorageClient, StorageHttpApp } from './storage-http';

const SMALL_BYTES = 4096;
const NAME = 'informe.txt';

interface VersionRow {
  readonly id: string;
  readonly numero: number;
}

/**
 * Versiones concurrentes del mismo archivo (014 CA-4) con Postgres real: `lockUsage` serializa por propietario la
 * numeración y `uq_version_archivo_numero` es la red de seguridad. Dos reemplazos completados a la vez dejan números
 * consecutivos únicos, la de mayor número como actual y `espacio_usado` exacto.
 */
describe('versiones concurrentes (014 CA-4)', () => {
  let storage: StorageHttpApp;

  beforeAll(async () => {
    storage = await createStorageHttpApp();
  });

  afterAll(async () => {
    await storage?.close();
  });

  const versionRows = (fileId: string): Promise<VersionRow[]> =>
    storage.owner.query<VersionRow[]>(
      'SELECT id, numero FROM version_archivo WHERE archivo_id = $1 ORDER BY numero',
      [fileId],
    );

  /** Inicia un reemplazo de `NAME` y sube sus bytes, sin completarlo. */
  const uploadedReplacement = async (client: StorageClient, bytes: Buffer): Promise<string> => {
    const started = await client.init({
      name: NAME,
      sizeBytes: bytes.length,
      onConflict: 'replace',
    });
    expect(started.status).toBe(201);
    const init = initUploadResponseSchema.parse(started.body) as InitBody;
    await uploadBytes(init, bytes);
    return init.uploadId;
  };

  it('CA-4: dos reemplazos simultáneos producen dos versiones con números consecutivos distintos', async () => {
    const client = await storage.newClient();
    const original = await client.upload(NAME, textBytes(SMALL_BYTES));
    const fileId = (original.body as { file: { id: string } }).file.id;
    const first = await uploadedReplacement(client, textBytes(2 * SMALL_BYTES));
    const second = await uploadedReplacement(client, textBytes(3 * SMALL_BYTES));

    const responses = await Promise.all([client.complete(first), client.complete(second)]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const rows = await versionRows(fileId);
    expect(rows.map((row) => row.numero)).toEqual([1, 2, 3]);
    const [current] = await storage.owner.query<{ version_actual_id: string }[]>(
      'SELECT version_actual_id FROM archivo WHERE id = $1',
      [fileId],
    );
    expect(current?.version_actual_id).toBe(rows[2]?.id);
    expect(await usedBytesOf(storage.owner, client.id)).toBe(BigInt(6 * SMALL_BYTES));
  });

  it.todo('CA-4: un reemplazo y una restauración simultáneos (se completa en T-06)');
});
