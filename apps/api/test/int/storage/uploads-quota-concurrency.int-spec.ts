import { countRows, createStorageHttpApp } from './storage-http';
import type { StorageHttpApp } from './storage-http';

const QUOTA_BYTES = 1_000;
const DECLARED_BYTES = 600;
/** Varias rondas: una carrera que se gana por azar una vez no demuestra el bloqueo. */
const ROUNDS = 5;

/**
 * Reserva concurrente contra Postgres real (CA-23): dos inicios simultáneos con cupo para uno se serializan por el
 * `FOR UPDATE` de `usuario`; el segundo ve la reserva del primero y responde `STORAGE_QUOTA_EXCEEDED`.
 */
describe('dos inicios simultáneos con cupo para uno (CA-23)', () => {
  let storage: StorageHttpApp;

  beforeAll(async () => {
    storage = await createStorageHttpApp({
      limits: {
        maxFileBytes: BigInt(QUOTA_BYTES),
        storageQuotaBytes: BigInt(QUOTA_BYTES),
        trashRetentionDays: 30,
        retainedVersions: 3,
        readOnly: false,
        planName: 'Plan de prueba',
      },
    });
  });

  afterAll(async () => {
    await storage?.close();
  });

  it.each(Array.from({ length: ROUNDS }, (_, round) => round + 1))(
    'CA-23: ronda %p: uno reserva (201) y el otro es 422 `STORAGE_QUOTA_EXCEEDED`',
    async () => {
      const client = await storage.newClient();

      const responses = await Promise.all([
        client.init({ name: 'a.txt', sizeBytes: DECLARED_BYTES }),
        client.init({ name: 'b.txt', sizeBytes: DECLARED_BYTES }),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([201, 422]);
      const rejected = responses.find((response) => response.status === 422);
      expect(rejected?.body).toMatchObject({
        code: 'STORAGE_QUOTA_EXCEEDED',
        details: { missingBytes: 2 * DECLARED_BYTES - QUOTA_BYTES },
      });
      expect(await countRows(storage.owner, 'carga', client.id)).toBe(1);
    },
  );
});
