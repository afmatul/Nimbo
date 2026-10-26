import { randomUUID } from 'node:crypto';

import type { FileVersion } from '../../../src/modules/storage/domain/file-version';
import { CorrelationContext } from '../../../src/shared';

import { registerVersion } from './register-version';
import { createStorageHttpApp, textBytes, usedBytesOf } from './storage-http';
import type { StorageHttpApp } from './storage-http';

/** Lo que queda de una versión en `version_archivo`, visto por el dueño de las tablas. */
interface VersionRow {
  readonly id: string;
  readonly numero: number;
  readonly clave_objeto: string;
}

/**
 * Registro y poda de versiones de punta a punta (014 CA-13, CA-19): `FileVersionService` real dentro de una
 * transacción con actor, Postgres como `nimbo_app` (RLS), el MinIO real del arnés (bucket versionado) y los límites
 * reales de Personal (la cifra se lee de la semilla, RN-1). El reemplazo por HTTP se prueba en
 * `versions-replace.int-spec.ts`; aquí el camino de escritura se llama como lo hace `UploadRegistrar`.
 */
describe('registro y poda de versiones con el plan Personal (014 CA-13, CA-19)', () => {
  let storage: StorageHttpApp;
  let retained: number;
  let trashRetentionDays: number;

  beforeAll(async () => {
    storage = await createStorageHttpApp({ realPlanLimits: true });
    const [row] = await storage.owner.query<
      { versiones_retenidas: number; dias_retencion_papelera: number }[]
    >("SELECT versiones_retenidas, dias_retencion_papelera FROM plan WHERE slug = 'personal'");
    if (row === undefined) throw new Error('Falta el plan personal sembrado (006a)');
    retained = row.versiones_retenidas;
    trashRetentionDays = row.dias_retencion_papelera;
  });

  afterAll(async () => {
    await storage?.close();
  });

  const versionRows = (fileId: string): Promise<VersionRow[]> =>
    storage.owner.query<VersionRow[]>(
      'SELECT id, numero, clave_objeto FROM version_archivo WHERE archivo_id = $1 ORDER BY numero',
      [fileId],
    );

  it('CA-13, CA-19: al pasar el límite poda la más antigua (objeto, fila y espacio), audita sin nombres ni claves y no reutiliza números', async () => {
    const ana = await storage.newClient();
    const name = `secreto-${randomUUID()}.txt`;
    const uploaded = await ana.upload(name, textBytes(1000));
    expect(uploaded.status).toBe(200);
    const fileId = (uploaded.body as { file: { id: string } }).file.id;
    const [first] = await versionRows(fileId);
    const correlationId = randomUUID();

    const sizes = Array.from({ length: retained }, (_, index) => 2000 + index * 1000);
    const versions = await CorrelationContext.run({ correlationId }, async () => {
      const registered: FileVersion[] = [];
      for (const size of sizes)
        registered.push(await registerVersion(storage, ana, { fileId, sizeBytes: size }));
      return registered;
    });

    expect(retained).toBe(3);
    const rows = await versionRows(fileId);
    expect(rows.map((row) => row.numero)).toEqual([2, 3, 4]);
    await expect(storage.versionsOf(first?.clave_objeto ?? '')).resolves.toBe(0);
    await expect(usedBytesOf(storage.owner, ana.id)).resolves.toBe(
      BigInt(sizes.reduce((sum, size) => sum + size, 0)),
    );
    const [file] = await storage.owner.query<{ version_actual_id: string; tamano_bytes: string }[]>(
      'SELECT version_actual_id, tamano_bytes FROM archivo WHERE id = $1',
      [fileId],
    );
    expect(file).toEqual({
      version_actual_id: versions.at(-1)?.id,
      tamano_bytes: String(sizes.at(-1)),
    });

    const lines = storage.testApp.logs.withCorrelationId(correlationId);
    const pruned = lines.filter(
      (line) => line.event === 'audit.record' && line.action === 'file.version_pruned',
    );
    expect(pruned).toEqual([
      expect.objectContaining({
        actorId: ana.id,
        resourceId: fileId,
        attributes: { versionId: first?.id, versionNumber: 1, sizeBytes: 1000 },
      }),
    ]);
    expect(lines.filter((line) => line.event === 'version.registered')).toHaveLength(retained);
    const logged = JSON.stringify(lines);
    expect(logged).not.toContain(name);
    expect(logged).not.toContain('u/');

    const next = await registerVersion(storage, ana, { fileId, sizeBytes: 500 });
    expect(next.number).toBe(5);
    expect((await versionRows(fileId)).map((row) => row.numero)).toEqual([3, 4, 5]);
  });

  it('014b CA-8, RN-5, RN-7: la poda alcanza al original conservado antes de su fecha y lo borra sin restar de `espacio_usado`', async () => {
    const ana = await storage.newClient();
    const uploaded = await ana.upload(`secreto-${randomUUID()}.txt`, textBytes(1000));
    expect(uploaded.status).toBe(200);
    const fileId = (uploaded.body as { file: { id: string } }).file.id;
    const [original] = await versionRows(fileId);
    await registerVersion(storage, ana, {
      fileId,
      sizeBytes: 600,
      keepPreviousForDays: trashRetentionDays,
    });
    await expect(usedBytesOf(storage.owner, ana.id)).resolves.toBe(600n);

    for (const sizeBytes of [700, 800]) await registerVersion(storage, ana, { fileId, sizeBytes });

    expect(retained).toBe(3);
    expect((await versionRows(fileId)).map((row) => row.numero)).toEqual([2, 3, 4]);
    await expect(storage.versionsOf(original?.clave_objeto ?? '')).resolves.toBe(0);
    await expect(usedBytesOf(storage.owner, ana.id)).resolves.toBe(600n + 700n + 800n);
  });
});
