import { spaceSummaryResponseSchema } from '@nimbo/contracts';
import type { SpaceBreakdown } from '@nimbo/contracts';

import { createStorageHttpApp, textBytes, usedBytesOf } from './storage-http';
import type { StorageClient, StorageHttpApp } from './storage-http';

const ORIGINAL_BYTES = 3000;
const OPTIMIZED_BYTES = 1000;

/** Lo que mide el desglose: la misma medición que usa la conciliación de 007 (`SpaceMeasurer`). */
const totalOf = (breakdown: SpaceBreakdown): number =>
  breakdown.documentsBytes + breakdown.imagesBytes + breakdown.otherBytes + breakdown.trashBytes;

/**
 * Coherencia del espacio con originales conservados (014b CA-9, CA-10, RN-7) con Postgres y MinIO reales. La versión
 * menor se sube como reemplazo y la conservación del original se marca como el dueño de las tablas, con el mismo
 * resultado que `FileVersionService.register` (su camino real lo cubre `versions-optimization.int-spec.ts`): aquí se
 * prueba que medidor, papelera y purga suman solo las versiones que cuentan.
 */
describe('espacio con originales conservados (014b CA-9, CA-10)', () => {
  let storage: StorageHttpApp;

  beforeAll(async () => {
    storage = await createStorageHttpApp();
  });

  afterAll(async () => {
    await storage?.close();
  });

  /** Sube `name` en `folderId`; devuelve el id del archivo. */
  const uploaded = async (
    client: StorageClient,
    name: string,
    folderId: string | null = null,
  ): Promise<string> => {
    const response = await client.upload(name, textBytes(ORIGINAL_BYTES), 'ask', folderId);
    expect(response.status).toBe(200);
    return (response.body as { file: { id: string } }).file.id;
  };

  /** Reemplaza el archivo por una versión menor y conserva la anterior, como una optimización registrada. */
  const optimized = async (client: StorageClient, name: string, folderId: string | null) => {
    const replaced = await client.upload(name, textBytes(OPTIMIZED_BYTES), 'replace', folderId);
    expect(replaced.status).toBe(200);
    const fileId = (replaced.body as { file: { id: string } }).file.id;
    await storage.owner.query(
      `UPDATE version_archivo SET conservada_hasta = creada_en + interval '7 days'
        WHERE archivo_id = $1 AND numero = 1`,
      [fileId],
    );
    await storage.owner.query(
      'UPDATE usuario SET espacio_usado = espacio_usado - $1 WHERE id = $2',
      [ORIGINAL_BYTES, client.id],
    );
    return fileId;
  };

  const breakdownOf = async (client: StorageClient) => {
    const response = await client.spaceSummary();
    expect(response.status).toBe(200);
    return spaceSummaryResponseSchema.parse(response.body);
  };

  it('CA-10: el medidor no suma el original y coincide con `espacio_usado` (la conciliación no tendría deriva)', async () => {
    const ana = await storage.newClient();
    await uploaded(ana, 'informe.txt');
    await optimized(ana, 'informe.txt', null);

    const summary = await breakdownOf(ana);

    expect(summary.usedBytes).toBe(OPTIMIZED_BYTES);
    expect(totalOf(summary.breakdown)).toBe(OPTIMIZED_BYTES);
  });

  it('CA-9, CA-10: en la papelera, el archivo y la carpeta que lo arrastró pesan solo lo que cuenta', async () => {
    const bruno = await storage.newClient();
    const loose = await uploaded(bruno, 'suelto.txt');
    await optimized(bruno, 'suelto.txt', null);
    const folder = await bruno.createFolder({ name: 'Viejos', parentId: null });
    const folderId = (folder.body as { id: string }).id;
    await uploaded(bruno, 'dentro.txt', folderId);
    await optimized(bruno, 'dentro.txt', folderId);

    expect((await bruno.trashFile(loose)).status).toBe(200);
    expect((await bruno.trashFolder(folderId)).status).toBe(200);
    const summary = await breakdownOf(bruno);

    expect(summary.breakdown.trashBytes).toBe(2 * OPTIMIZED_BYTES);
    expect(totalOf(summary.breakdown)).toBe(summary.usedBytes);
  });

  it('CA-9, RN-7: purgar el archivo borra todas sus versiones y resta solo lo que contaba', async () => {
    const carla = await storage.newClient();
    await uploaded(carla, 'plano.txt');
    const fileId = await optimized(carla, 'plano.txt', null);
    const keys = (await storage.owner.query(
      'SELECT clave_objeto FROM version_archivo WHERE archivo_id = $1',
      [fileId],
    )) as { clave_objeto: string }[];

    expect((await carla.trashFile(fileId)).status).toBe(200);
    expect((await carla.purgeFile(fileId)).status).toBe(200);

    await expect(usedBytesOf(storage.owner, carla.id)).resolves.toBe(0n);
    expect(keys).toHaveLength(2);
    for (const { clave_objeto: key } of keys) {
      await expect(storage.versionsOf(key)).resolves.toBe(0);
    }
  });
});
