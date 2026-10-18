import { formatBytes } from '@nimbo/contracts';

import {
  countRows,
  createStorageHttpApp,
  DEFAULT_TEST_LIMITS,
  textBytes,
  usedBytesOf,
} from './storage-http';
import type { StorageHttpApp } from './storage-http';

const MAX_FILE_BYTES = 2_000;
const QUOTA_BYTES = 10_000;

/**
 * Máximo por archivo y cuota total en el inicio, con el doble de `IPlanLimitsProvider` (R-3) y la reserva real de
 * `carga` en Postgres (CA-3, CA-4, CA-23). Ninguna cifra sale del catálogo de planes (RN-1).
 */
describe('POST /uploads contra los límites del plan (CA-3, CA-4, CA-23)', () => {
  let storage: StorageHttpApp;

  beforeAll(async () => {
    storage = await createStorageHttpApp();
  });

  beforeEach(() => {
    storage.limits.setLimits({
      maxFileBytes: BigInt(MAX_FILE_BYTES),
      storageQuotaBytes: BigInt(QUOTA_BYTES),
      trashRetentionDays: 30,
      retainedVersions: 3,
      maxEditors: 0,
      planName: 'Plan de prueba',
    });
  });

  afterAll(async () => {
    storage?.limits.setLimits(DEFAULT_TEST_LIMITS);
    await storage?.close();
  });

  it('CA-3: un archivo mayor que el máximo del plan es 422 con las cifras, sin sesión ni reserva', async () => {
    const client = await storage.newClient();

    const response = await client.init({ name: 'grande.txt', sizeBytes: MAX_FILE_BYTES + 1 });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      code: 'STORAGE_FILE_TOO_LARGE',
      message:
        `Este archivo pesa ${formatBytes(MAX_FILE_BYTES + 1)} y tu plan permite hasta ` +
        `${formatBytes(MAX_FILE_BYTES)} por archivo. Reduce su tamaño o cambia de plan.`,
      details: { sizeBytes: MAX_FILE_BYTES + 1, maxBytes: MAX_FILE_BYTES },
    });
    expect(await countRows(storage.owner, 'carga', client.id)).toBe(0);
  });

  it('CA-3: justo el máximo del plan sí se acepta', async () => {
    const client = await storage.newClient();

    const response = await client.init({ name: 'justo.txt', sizeBytes: MAX_FILE_BYTES });

    expect(response.status).toBe(201);
  });

  it('CA-4: usado + reservado + declarado por encima de la cuota es 422 con los bytes que faltan', async () => {
    const client = await storage.newClient();
    storage.limits.setLimits({
      maxFileBytes: BigInt(QUOTA_BYTES),
      storageQuotaBytes: BigInt(QUOTA_BYTES),
      trashRetentionDays: 30,
      retainedVersions: 3,
      maxEditors: 0,
      planName: 'Plan de prueba',
    });
    await storage.owner.query('UPDATE usuario SET espacio_usado = $1 WHERE id = $2', [
      6_000,
      client.id,
    ]);
    expect((await client.init({ name: 'reserva.txt', sizeBytes: 3_000 })).status).toBe(201);

    const response = await client.init({ name: 'otro.txt', sizeBytes: 1_500 });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      code: 'STORAGE_QUOTA_EXCEEDED',
      message: `Te faltan ${formatBytes(500)} de espacio para subir este archivo. Libera espacio o cambia de plan.`,
      details: { missingBytes: 500 },
    });
    expect(await countRows(storage.owner, 'carga', client.id)).toBe(1);
  });

  it('CA-23: cancelar libera la reserva y la siguiente carga cabe', async () => {
    const client = await storage.newClient();
    const first = await client.init({ name: 'primera.txt', sizeBytes: 1_800 });
    storage.limits.setLimits({
      maxFileBytes: BigInt(MAX_FILE_BYTES),
      storageQuotaBytes: 3_000n,
      trashRetentionDays: 30,
      retainedVersions: 3,
      maxEditors: 0,
      planName: 'Plan de prueba',
    });
    expect((await client.init({ name: 'segunda.txt', sizeBytes: 1_800 })).status).toBe(422);

    expect((await client.cancel((first.body as { uploadId: string }).uploadId)).status).toBe(204);

    expect((await client.init({ name: 'segunda.txt', sizeBytes: 1_800 })).status).toBe(201);
  });

  it('CA-23: completar convierte la reserva en uso real sin contarla dos veces', async () => {
    const client = await storage.newClient();
    storage.limits.setLimits({
      maxFileBytes: BigInt(MAX_FILE_BYTES),
      storageQuotaBytes: 3_000n,
      trashRetentionDays: 30,
      retainedVersions: 3,
      maxEditors: 0,
      planName: 'Plan de prueba',
    });

    expect((await client.upload('uso.txt', textBytes(1_800))).status).toBe(200);

    expect(await usedBytesOf(storage.owner, client.id)).toBe(1_800n);
    expect((await client.init({ name: 'resto.txt', sizeBytes: 1_200 })).status).toBe(201);
    expect((await client.init({ name: 'uno-mas.txt', sizeBytes: 1 })).status).toBe(422);
  });

  it('CA-3, CA-4: los límites se piden al proveedor con el actor de la petición', async () => {
    const client = await storage.newClient();

    await client.init({ name: 'actor.txt', sizeBytes: 10 });

    expect(storage.limits.requestedFor).toContain(client.id);
  });
});
