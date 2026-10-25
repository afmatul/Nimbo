import { randomUUID } from 'node:crypto';

import {
  downloadUrlSchema,
  fileVersionsResponseSchema,
  fileVersionSummarySchema,
} from '@nimbo/contracts';

import { I_PLAN_LIMITS_PROVIDER } from '../../../src/modules/storage';
import type { IPlanLimitsProvider } from '../../../src/modules/storage';
import { createActor, Role } from '../../../src/shared';

import { registerVersion } from './register-version';
import { createStorageHttpApp, DEFAULT_TEST_LIMITS, textBytes, usedBytesOf } from './storage-http';
import type { StorageClient, StorageHttpApp } from './storage-http';

const ORIGINAL_BYTES = 8192;
const OPTIMIZED_BYTES = 3072;
const DAY_MS = 86_400_000;

/** Lo que guarda `version_archivo` de una versión, visto por el dueño de las tablas. */
interface VersionRow {
  readonly id: string;
  readonly numero: number;
  readonly origen: string;
  readonly creada_en: Date;
  readonly conservada_hasta: Date | null;
}

/** Un archivo subido por HTTP (la versión 1, de `ORIGINAL_BYTES`) y su contenido. */
interface UploadedFile {
  readonly fileId: string;
  readonly originalId: string;
  readonly original: Buffer;
}

/**
 * El original conservado por una optimización (014b CA-1 a CA-5) con Postgres como `nimbo_app` (RLS) y MinIO real.
 * El origen `optimizacion` es un doble de 021 (como 014 CA-5): `registerVersion` sube un objeto menor y lo registra con
 * los días de `PlanLimits.trashRetentionDays`, leídos antes de la transacción.
 */
describe('versión `optimizacion` y original conservado (014b CA-1 a CA-5)', () => {
  let storage: StorageHttpApp;

  beforeAll(async () => {
    storage = await createStorageHttpApp();
  });

  afterAll(async () => {
    await storage?.close();
  });

  const versionRows = (fileId: string): Promise<VersionRow[]> =>
    storage.owner.query<VersionRow[]>(
      `SELECT id, numero, origen, creada_en, conservada_hasta
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

  const uploadFile = async (client: StorageClient): Promise<UploadedFile> => {
    const original = textBytes(ORIGINAL_BYTES, 'original');
    const uploaded = await client.upload(`informe-${randomUUID()}.txt`, original);
    expect(uploaded.status).toBe(200);
    const fileId = (uploaded.body as { file: { id: string } }).file.id;
    return { fileId, originalId: (await currentVersionOf(fileId)) ?? '', original };
  };

  /** Doble del registrador de 021: sube `sizeBytes` y registra la versión `optimizacion`; devuelve su id. */
  const registerOptimized = async (
    client: StorageClient,
    fileId: string,
    sizeBytes: number,
  ): Promise<string> => {
    const actor = createActor(client.id, Role.CLIENT);
    const { trashRetentionDays } = await storage.testApp.app
      .get<IPlanLimitsProvider>(I_PLAN_LIMITS_PROVIDER)
      .limitsFor(actor);
    const next = { fileId, sizeBytes, keepPreviousForDays: trashRetentionDays };
    return (await registerVersion(storage, client, next)).id;
  };

  /** Archivo subido y optimizado: versión 1 conservada, versión 2 `optimizacion` actual. */
  const optimizedFile = async (
    client: StorageClient,
  ): Promise<UploadedFile & { optimizedId: string }> => {
    const uploaded = await uploadFile(client);
    const optimizedId = await registerOptimized(client, uploaded.fileId, OPTIMIZED_BYTES);
    return { ...uploaded, optimizedId };
  };

  const keptUntilOf = async (fileId: string, versionId: string): Promise<Date | null> => {
    const row = (await versionRows(fileId)).find((candidate) => candidate.id === versionId);
    return row?.conservada_hasta ?? null;
  };

  const download = async (url: unknown): Promise<Buffer> => {
    const response = await fetch(downloadUrlSchema.parse(url).url);
    return Buffer.from(await response.arrayBuffer());
  };

  it('CA-1: la optimizada es la actual, el original se conserva registro + días del plan y el espacio cambia en Y − X', async () => {
    const client = await storage.newClient();
    const { fileId, originalId } = await uploadFile(client);
    const usedBefore = await usedBytesOf(storage.owner, client.id);

    const optimizedId = await registerOptimized(client, fileId, OPTIMIZED_BYTES);

    const [original, optimized] = await versionRows(fileId);
    expect(original).toMatchObject({ id: originalId, numero: 1 });
    expect(optimized).toMatchObject({ id: optimizedId, numero: 2, origen: 'optimizacion' });
    expect(optimized?.conservada_hasta).toBeNull();
    const retentionMs = DEFAULT_TEST_LIMITS.trashRetentionDays * DAY_MS;
    expect(original?.conservada_hasta?.getTime()).toBe(
      (optimized?.creada_en.getTime() ?? 0) + retentionMs,
    );
    expect(await currentVersionOf(fileId)).toBe(optimizedId);
    expect(await usedBytesOf(storage.owner, client.id)).toBe(
      usedBefore + BigInt(OPTIMIZED_BYTES - ORIGINAL_BYTES),
    );
  });

  it('CA-2: con la cuenta llena se registra sin `STORAGE_QUOTA_EXCEEDED` y el espacio baja', async () => {
    const client = await storage.newClient();
    const { fileId } = await uploadFile(client);
    const usedBefore = await usedBytesOf(storage.owner, client.id);
    storage.limits.setLimits({ ...DEFAULT_TEST_LIMITS, storageQuotaBytes: usedBefore });

    try {
      const optimizedId = await registerOptimized(client, fileId, OPTIMIZED_BYTES);

      expect(await currentVersionOf(fileId)).toBe(optimizedId);
    } finally {
      storage.limits.setLimits(DEFAULT_TEST_LIMITS);
    }
    expect(await usedBytesOf(storage.owner, client.id)).toBe(
      usedBefore - BigInt(ORIGINAL_BYTES - OPTIMIZED_BYTES),
    );
  });

  it.each([
    ['igual', ORIGINAL_BYTES],
    ['mayor', ORIGINAL_BYTES + 1],
  ])(
    'CA-3: una optimizada de tamaño %s que el original se rechaza y la transacción no cambia nada',
    async (_case, sizeBytes) => {
      const client = await storage.newClient();
      const { fileId, originalId } = await uploadFile(client);
      const rowsBefore = await versionRows(fileId);
      const usedBefore = await usedBytesOf(storage.owner, client.id);

      await expect(registerOptimized(client, fileId, sizeBytes)).rejects.toThrow(TypeError);

      expect(await versionRows(fileId)).toEqual(rowsBefore);
      expect(await currentVersionOf(fileId)).toBe(originalId);
      expect(await usedBytesOf(storage.owner, client.id)).toBe(usedBefore);
    },
  );

  it('CA-4: el historial trae `keptUntil` solo en el original, que se sigue descargando como en 014 CA-8', async () => {
    const client = await storage.newClient();
    const file = await optimizedFile(client);

    const response = await client.fileVersions(file.fileId);

    expect(response.status).toBe(200);
    const { items } = fileVersionsResponseSchema.parse(response.body);
    const keptUntil = await keptUntilOf(file.fileId, file.originalId);
    expect(items.map(({ id, keptUntil: until }) => [id, until])).toEqual([
      [file.optimizedId, null],
      [file.originalId, keptUntil?.toISOString()],
    ]);
    const issued = await client.versionDownloadUrl(file.fileId, file.originalId);
    expect(issued.status).toBe(200);
    expect(await download(issued.body)).toEqual(file.original);
  });

  it('CA-5: restaurar el original crea una `restauracion` que cuenta; el original conserva su fecha y sigue sin contar', async () => {
    const client = await storage.newClient();
    const file = await optimizedFile(client);
    const keptUntil = await keptUntilOf(file.fileId, file.originalId);
    const usedBefore = await usedBytesOf(storage.owner, client.id);

    const response = await client.restoreVersion(file.fileId, file.originalId);

    expect(response.status).toBe(201);
    const restored = fileVersionSummarySchema.parse(response.body);
    expect(restored).toMatchObject({
      number: 3,
      origin: 'restauracion',
      restoredFromNumber: 1,
      sizeBytes: ORIGINAL_BYTES,
      keptUntil: null,
      isCurrent: true,
    });
    expect(await usedBytesOf(storage.owner, client.id)).toBe(usedBefore + BigInt(ORIGINAL_BYTES));
    expect(await keptUntilOf(file.fileId, file.originalId)).toEqual(keptUntil);
  });

  it('CA-5: sin espacio para el original es `422 STORAGE_QUOTA_EXCEEDED` y no cambia nada', async () => {
    const client = await storage.newClient();
    const file = await optimizedFile(client);
    const rowsBefore = await versionRows(file.fileId);
    const usedBefore = await usedBytesOf(storage.owner, client.id);
    storage.limits.setLimits({
      ...DEFAULT_TEST_LIMITS,
      storageQuotaBytes: usedBefore + BigInt(ORIGINAL_BYTES - 1),
    });

    try {
      const response = await client.restoreVersion(file.fileId, file.originalId);

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ code: 'STORAGE_QUOTA_EXCEEDED' });
    } finally {
      storage.limits.setLimits(DEFAULT_TEST_LIMITS);
    }
    expect(await versionRows(file.fileId)).toEqual(rowsBefore);
    expect(await currentVersionOf(file.fileId)).toBe(file.optimizedId);
    expect(await usedBytesOf(storage.owner, client.id)).toBe(usedBefore);
  });
});
