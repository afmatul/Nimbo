import { downloadUrlSchema, fileVersionSummarySchema } from '@nimbo/contracts';

import { createStorageHttpApp, DEFAULT_TEST_LIMITS, textBytes, usedBytesOf } from './storage-http';
import type { StorageClient, StorageHttpApp } from './storage-http';

const ORIGINAL_BYTES = 4096;
const REPLACEMENT_BYTES = 6144;
const NAME = 'informe.txt';

/** Lo que guarda `version_archivo` de una versión, visto por el dueño de las tablas. */
interface VersionRow {
  readonly id: string;
  readonly numero: number;
  readonly origen: string;
  readonly restaurada_de_numero: number | null;
  readonly clave_objeto: string;
  readonly tamano_bytes: string;
}

/** Un archivo con dos versiones: la 1 (`original`) y la 2, actual (`replacement`). */
interface TwoVersions {
  readonly fileId: string;
  readonly rows: readonly VersionRow[];
  readonly original: Buffer;
}

/**
 * Restaurar una versión por HTTP (014 CA-9 a CA-12, CA-19) con Postgres como `nimbo_app` (RLS) y MinIO real: la copia
 * del objeto se hace en el servidor y la versión nueva se registra con la misma numeración y cuota que un reemplazo.
 */
describe('POST /files/:fileId/versions/:versionId/restore (014)', () => {
  let storage: StorageHttpApp;

  beforeAll(async () => {
    storage = await createStorageHttpApp();
  });

  afterAll(async () => {
    await storage?.close();
  });

  const versionRows = (fileId: string): Promise<VersionRow[]> =>
    storage.owner.query<VersionRow[]>(
      `SELECT id, numero, origen, restaurada_de_numero, clave_objeto, tamano_bytes::text AS tamano_bytes
         FROM version_archivo WHERE archivo_id = $1 ORDER BY numero`,
      [fileId],
    );

  const currentVersionOf = async (fileId: string): Promise<string | undefined> => {
    const [row] = await storage.owner.query<{ version_actual_id: string }[]>(
      'SELECT version_actual_id FROM archivo WHERE id = $1',
      [fileId],
    );
    return row?.version_actual_id;
  };

  /** Sube `NAME` y lo reemplaza una vez por la API (T-04). */
  const twoVersions = async (client: StorageClient): Promise<TwoVersions> => {
    const original = textBytes(ORIGINAL_BYTES, 'original');
    const uploaded = await client.upload(NAME, original);
    expect(uploaded.status).toBe(200);
    const fileId = (uploaded.body as { file: { id: string } }).file.id;
    const replaced = await client.upload(NAME, textBytes(REPLACEMENT_BYTES, 'nueva'), 'replace');
    expect(replaced.status).toBe(200);
    return { fileId, rows: await versionRows(fileId), original };
  };

  const versionIdOf = (versions: TwoVersions, number: number): string => {
    const row = versions.rows.find((candidate) => candidate.numero === number);
    if (row === undefined) throw new Error(`Falta la versión ${String(number)}`);
    return row.id;
  };

  const download = async (client: StorageClient, fileId: string): Promise<Buffer> => {
    const issued = await client.downloadUrl(fileId);
    const response = await fetch(downloadUrlSchema.parse(issued.body).url);
    return Buffer.from(await response.arrayBuffer());
  };

  it('CA-9: crea la versión 3 `restauracion` con el contenido de la 1 copiado en MinIO; ninguna otra cambia y el espacio sube', async () => {
    const client = await storage.newClient();
    const versions = await twoVersions(client);
    const usedBefore = await usedBytesOf(storage.owner, client.id);

    const response = await client.restoreVersion(versions.fileId, versionIdOf(versions, 1));

    expect(response.status).toBe(201);
    const summary = fileVersionSummarySchema.parse(response.body);
    expect(summary).toMatchObject({
      number: 3,
      origin: 'restauracion',
      restoredFromNumber: 1,
      sizeBytes: ORIGINAL_BYTES,
      deltaBytes: String(ORIGINAL_BYTES - REPLACEMENT_BYTES),
      createdById: client.id,
      isCurrent: true,
    });
    const rows = await versionRows(versions.fileId);
    expect(rows.slice(0, 2)).toEqual(versions.rows);
    const restored = rows[2];
    expect(restored).toMatchObject({ id: summary.id, origen: 'restauracion' });
    expect(restored?.restaurada_de_numero).toBe(1);
    expect(restored?.clave_objeto).toBe(`u/${client.id}/${versions.fileId}/${summary.id}`);
    expect(await storage.readObject(restored?.clave_objeto ?? '')).toEqual(versions.original);
    expect(await currentVersionOf(versions.fileId)).toBe(summary.id);
    expect(await download(client, versions.fileId)).toEqual(versions.original);
    expect(await usedBytesOf(storage.owner, client.id)).toBe(usedBefore + BigInt(ORIGINAL_BYTES));
    expect(JSON.stringify(response.body)).not.toContain('u/');
  });

  it('CA-19: audita `file.version_restored` con UUID, números y bytes, sin nombre ni clave de objeto', async () => {
    const client = await storage.newClient();
    const versions = await twoVersions(client);

    const response = await client.restoreVersion(versions.fileId, versionIdOf(versions, 1));

    expect(response.status).toBe(201);
    const { id } = fileVersionSummarySchema.parse(response.body);
    const lines = storage.testApp.logs
      .lines()
      .filter((line) => line.resourceId === versions.fileId || line.fileId === versions.fileId);
    expect(
      lines.filter(
        (line) => line.event === 'audit.record' && line.action === 'file.version_restored',
      ),
    ).toEqual([
      expect.objectContaining({
        actorId: client.id,
        resourceId: versions.fileId,
        correlationId: expect.any(String) as unknown,
        attributes: {
          versionId: id,
          versionNumber: 3,
          restoredFromNumber: 1,
          sizeBytes: ORIGINAL_BYTES,
        },
      }),
    ]);
    const logged = JSON.stringify(lines);
    expect(logged).not.toContain(NAME);
    expect(logged).not.toContain('u/');
  });

  it('CA-10: restaurar la versión actual es `409 STORAGE_VERSION_ALREADY_CURRENT` y no cambia nada', async () => {
    const client = await storage.newClient();
    const versions = await twoVersions(client);
    const usedBefore = await usedBytesOf(storage.owner, client.id);

    const response = await client.restoreVersion(versions.fileId, versionIdOf(versions, 2));

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'STORAGE_VERSION_ALREADY_CURRENT',
      message: 'Esta ya es la versión actual.',
    });
    expect(await versionRows(versions.fileId)).toEqual(versions.rows);
    expect(await usedBytesOf(storage.owner, client.id)).toBe(usedBefore);
  });

  it('CA-12: si no cabe en la cuota es `422 STORAGE_QUOTA_EXCEEDED` con los bytes que faltan y no cambia nada', async () => {
    const client = await storage.newClient();
    const versions = await twoVersions(client);
    const usedBefore = await usedBytesOf(storage.owner, client.id);
    const missingBytes = 1;
    storage.limits.setLimits({
      ...DEFAULT_TEST_LIMITS,
      storageQuotaBytes: usedBefore + BigInt(ORIGINAL_BYTES - missingBytes),
    });

    try {
      const response = await client.restoreVersion(versions.fileId, versionIdOf(versions, 1));

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({
        code: 'STORAGE_QUOTA_EXCEEDED',
        message:
          'Te faltan 1 B de espacio para restaurar esta versión. Libera espacio o cambia de plan.',
        details: { missingBytes },
      });
    } finally {
      storage.limits.setLimits(DEFAULT_TEST_LIMITS);
    }
    expect(await versionRows(versions.fileId)).toEqual(versions.rows);
    expect(await usedBytesOf(storage.owner, client.id)).toBe(usedBefore);
  });

  it('CA-11: una versión de otro archivo es `404 STORAGE_VERSION_NOT_FOUND`', async () => {
    const client = await storage.newClient();
    const versions = await twoVersions(client);
    const other = await client.upload('otro.txt', textBytes(ORIGINAL_BYTES));
    const otherFileId = (other.body as { file: { id: string } }).file.id;
    const [otherVersion] = await versionRows(otherFileId);

    const response = await client.restoreVersion(versions.fileId, otherVersion?.id ?? '');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'STORAGE_VERSION_NOT_FOUND' });
    expect(await versionRows(versions.fileId)).toEqual(versions.rows);
  });
});
