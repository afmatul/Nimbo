import { explorerFolderSchema, spaceSummaryResponseSchema } from '@nimbo/contracts';
import type { SpaceSummaryResponse } from '@nimbo/contracts';

import { Role } from '../../../src/shared';

import { createStorageHttpApp, DEFAULT_TEST_LIMITS, otherBytes, textBytes } from './storage-http';
import type { StorageClient, StorageHttpApp } from './storage-http';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const NOTES_BYTES = 1000;
const PHOTO_BYTES = 500;
const DATA_BYTES = 300;
const NESTED_NOTES_BYTES = 200;
const NESTED_PHOTO_BYTES = 100;
const PENDING_UPLOAD_BYTES = 400;

/** Una imagen `.png` que el detector acepta: firma y relleno hasta `size`. */
const pngBytes = (size: number): Buffer =>
  Buffer.concat([PNG_SIGNATURE, Buffer.alloc(size - PNG_SIGNATURE.length, 0x41)]);

const QUOTA = Number(DEFAULT_TEST_LIMITS.storageQuotaBytes);

/** `GET /storage/summary` por HTTP con Postgres y MinIO reales (spec 007 CA-1 a CA-4, CA-6, CA-17). */
describe('GET /storage/summary (007 CA-1 a CA-4, CA-6, CA-17)', () => {
  let storage: StorageHttpApp;
  let ana: StorageClient;
  let trashedFolderId: string;

  const summaryOf = async (client: StorageClient): Promise<SpaceSummaryResponse> => {
    const response = await client.spaceSummary();
    expect(response.status).toBe(200);
    return spaceSummaryResponseSchema.parse(response.body);
  };

  const uploaded = async (name: string, bytes: Buffer, folderId: string | null = null) => {
    const response = await ana.upload(name, bytes, 'ask', folderId);
    expect(response.status).toBe(200);
  };

  const folder = async (name: string, parentId: string | null = null): Promise<string> => {
    const response = await ana.createFolder({ name, parentId });
    expect(response.status).toBe(201);
    return explorerFolderSchema.parse(response.body).id;
  };

  beforeAll(async () => {
    storage = await createStorageHttpApp();
    ana = await storage.newClient();
    await uploaded('notas.txt', textBytes(NOTES_BYTES));
    await uploaded('foto.png', pngBytes(PHOTO_BYTES));
    await uploaded('datos.bin', otherBytes(DATA_BYTES));
    trashedFolderId = await folder('Viaje');
    const nested = await folder('Fotos', trashedFolderId);
    await uploaded('bitacora.txt', textBytes(NESTED_NOTES_BYTES), nested);
    await uploaded('playa.png', pngBytes(NESTED_PHOTO_BYTES), trashedFolderId);
    expect((await ana.trashFolder(trashedFolderId)).status).toBe(200);
    const pending = await ana.init({ name: 'pendiente.txt', sizeBytes: PENDING_UPLOAD_BYTES });
    expect(pending.status).toBe(201);
  });

  afterAll(async () => {
    await storage?.close();
  });

  it('CA-1 a CA-3, CA-6: resume plan, uso, reserva, disponible y desglose; la carpeta anidada en la papelera cuenta una vez', async () => {
    const used = NOTES_BYTES + PHOTO_BYTES + DATA_BYTES + NESTED_NOTES_BYTES + NESTED_PHOTO_BYTES;

    const summary = await summaryOf(ana);

    expect(summary).toEqual({
      planName: DEFAULT_TEST_LIMITS.planName,
      usedBytes: used,
      reservedBytes: PENDING_UPLOAD_BYTES,
      quotaBytes: QUOTA,
      baseQuotaBytes: QUOTA,
      extraQuotaBytes: 0,
      extraQuotaUntil: null,
      availableBytes: QUOTA - used - PENDING_UPLOAD_BYTES,
      maxFileBytes: Number(DEFAULT_TEST_LIMITS.maxFileBytes),
      trashRetentionDays: DEFAULT_TEST_LIMITS.trashRetentionDays,
      readOnly: false,
      breakdown: {
        documentsBytes: NOTES_BYTES,
        imagesBytes: PHOTO_BYTES,
        otherBytes: DATA_BYTES,
        trashBytes: NESTED_NOTES_BYTES + NESTED_PHOTO_BYTES,
      },
    });
  });

  it('CA-2: una cuenta nueva no ve nada de otra y mide cero', async () => {
    const bruno = await storage.newClient();

    const summary = await summaryOf(bruno);

    expect(summary).toMatchObject({
      usedBytes: 0,
      reservedBytes: 0,
      availableBytes: QUOTA,
      breakdown: { documentsBytes: 0, imagesBytes: 0, otherBytes: 0, trashBytes: 0 },
    });
  });

  it('CA-4: al purgar la carpeta baja lo usado y la papelera queda en cero', async () => {
    const before = await summaryOf(ana);

    expect((await ana.purgeFolder(trashedFolderId)).status).toBe(200);

    const after = await summaryOf(ana);
    expect(after.usedBytes).toBe(before.usedBytes - before.breakdown.trashBytes);
    expect(after.breakdown).toEqual({ ...before.breakdown, trashBytes: 0 });
  });

  it.each([Role.ADMIN, Role.SUPPORT, Role.OPERATOR])(
    'CA-17: el rol interno %s recibe 403 SHARED_FORBIDDEN',
    async (role) => {
      const internal = await storage.newClient(role);

      const response = await internal.spaceSummary();

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'SHARED_FORBIDDEN' });
    },
  );

  it('CA-17: sin token responde 401 SHARED_UNAUTHENTICATED', async () => {
    const response = await storage.clientFor(ana.id).spaceSummary();

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: 'SHARED_UNAUTHENTICATED' });
  });
});
