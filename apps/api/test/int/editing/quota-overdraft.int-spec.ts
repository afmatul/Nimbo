import { createStorageHttpApp, DEFAULT_TEST_LIMITS, usedBytesOf } from '../storage/storage-http';
import type { StorageHttpApp } from '../storage/storage-http';

import { docxBytes } from './docx-bytes';
import { editedInput, registerAsOwner, uploadEditedDocument } from './edited-version-world';

/** Cuota de prueba que cabe en una carga chica pero no en la versión editada (cifra del doble, no del catálogo). */
const SMALL_QUOTA_BYTES = 8 * 1024;
const EDITED_PADDING_BYTES = 16 * 1024;

/** Sobregiro por edición (016 RN-8): la versión nunca se descarta por cuota; las cargas siguientes sí se bloquean. */
describe('versión de edición sobre la cuota (016 CA-20)', () => {
  let storage: StorageHttpApp;

  beforeAll(async () => {
    storage = await createStorageHttpApp({
      limits: { ...DEFAULT_TEST_LIMITS, storageQuotaBytes: BigInt(SMALL_QUOTA_BYTES) },
    });
  });

  afterAll(async () => {
    await storage?.close();
  });

  it('CA-20: la versión se guarda aunque supere la cuota y la carga siguiente responde `STORAGE_QUOTA_EXCEEDED`', async () => {
    const ana = await storage.newClient();
    const document = await uploadEditedDocument(storage, ana);
    const edited = docxBytes(EDITED_PADDING_BYTES);

    const outcome = await registerAsOwner(storage, ana.id, editedInput(document, ana.id, edited));

    expect(outcome.status).toBe('registered');
    const used = await usedBytesOf(storage.owner, ana.id);
    expect(used).toBeGreaterThan(BigInt(SMALL_QUOTA_BYTES));
    const next = await ana.init({
      name: 'notas.txt',
      sizeBytes: 16,
      onConflict: 'ask',
      folderId: null,
    });
    expect(next.status).toBe(422);
    expect((next.body as { code: string }).code).toBe('STORAGE_QUOTA_EXCEEDED');
  });
});
