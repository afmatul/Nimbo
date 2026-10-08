import { createStorageHttpApp } from './storage-http';
import type { StorageHttpApp } from './storage-http';

/**
 * `POST /uploads` con el enlace real de `I_PLAN_LIMITS_PROVIDER` (`PlanLimitsBindingModule` → `PlanLimitsAdapter` de
 * `billing`) y la tabla `plan` sembrada, sin el doble de R-3 (PD-56, revisión de 005 I-2). Las cifras se leen de la
 * semilla, no se repiten aquí (RN-1).
 */
describe('POST /uploads con los límites reales del plan (CA-3, PD-56)', () => {
  let storage: StorageHttpApp;
  let personalMaxFileBytes: number;

  beforeAll(async () => {
    storage = await createStorageHttpApp({ realPlanLimits: true });
    const [row] = await storage.owner.query<{ max_archivo_bytes: string }[]>(
      "SELECT max_archivo_bytes FROM plan WHERE slug = 'personal'",
    );
    if (row === undefined) throw new Error('Falta el plan personal sembrado (006a)');
    personalMaxFileBytes = Number(row.max_archivo_bytes);
  });

  afterAll(async () => {
    await storage?.close();
  });

  it('CA-3: un archivo mayor que el máximo de Personal es 422 con el máximo de la tabla `plan`', async () => {
    const client = await storage.newClient();

    const response = await client.init({ name: 'grande.pdf', sizeBytes: personalMaxFileBytes + 1 });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      code: 'STORAGE_FILE_TOO_LARGE',
      details: { sizeBytes: personalMaxFileBytes + 1, maxBytes: personalMaxFileBytes },
    });
  });

  it('CA-3: justo el máximo de Personal sí se acepta', async () => {
    const client = await storage.newClient();

    const response = await client.init({ name: 'justo.pdf', sizeBytes: personalMaxFileBytes });

    expect(response.status).toBe(201);
    await client.cancel((response.body as { uploadId: string }).uploadId);
  });
});
