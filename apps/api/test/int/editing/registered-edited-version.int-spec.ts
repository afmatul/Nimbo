import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import { ObjectKey } from '../../../src/modules/storage/domain/object-key';
import {
  createStorageHttpApp,
  DEFAULT_TEST_LIMITS,
  textBytes,
  usedBytesOf,
} from '../storage/storage-http';
import type { StorageHttpApp } from '../storage/storage-http';

import { docxBytes } from './docx-bytes';
import { editedInput, registerAsOwner, uploadEditedDocument } from './edited-version-world';
import { insertEditSession } from './editing-test-db';

interface VersionRow {
  readonly id: string;
  readonly numero: number;
  readonly origen: string;
  readonly creado_por: string;
  readonly sesion_edicion_id: string | null;
}

/**
 * Registro de la versión de una sesión de edición (plan 016 §2, ADR-0012) con `StorageModule` real: Postgres como
 * `nimbo_app` (RLS), MinIO real con bucket versionado y el doble de límites del plan (sin el andamiaje, §2.1).
 */
describe('versión de edición registrada por `storage` (016 CA-9, CA-10, CA-13, CA-14)', () => {
  let storage: StorageHttpApp;

  beforeAll(async () => {
    storage = await createStorageHttpApp({
      limits: { ...DEFAULT_TEST_LIMITS, retainedVersions: 3 },
    });
  });

  afterAll(async () => {
    await storage?.close();
  });

  const versionRows = (fileId: string): Promise<VersionRow[]> =>
    storage.owner.query<VersionRow[]>(
      `SELECT id, numero, origen, creado_por, sesion_edicion_id FROM version_archivo
        WHERE archivo_id = $1 ORDER BY numero`,
      [fileId],
    );

  it('CA-9: la versión nueva es la vigente, de origen `edicion`, con su sesión, quien abrió y su tamaño en el espacio', async () => {
    const ana = await storage.newClient();
    const bruno = await storage.newClient();
    const document = await uploadEditedDocument(storage, ana);
    const before = await usedBytesOf(storage.owner, ana.id);
    const content = docxBytes(4096);
    const input = editedInput(document, bruno.id, content);

    const outcome = await registerAsOwner(storage, ana.id, input);

    expect(outcome).toEqual({
      status: 'registered',
      versionId: input.versionId,
      versionNumber: 2,
      sizeBytes: BigInt(content.length),
    });
    const [, edited] = await versionRows(document.fileId);
    expect(edited).toEqual({
      id: input.versionId,
      numero: 2,
      origen: 'edicion',
      creado_por: bruno.id,
      sesion_edicion_id: document.sessionId,
    });
    const [file] = await storage.owner.query<{ version_actual_id: string }[]>(
      'SELECT version_actual_id FROM archivo WHERE id = $1',
      [document.fileId],
    );
    expect(file?.version_actual_id).toBe(input.versionId);
    await expect(usedBytesOf(storage.owner, ana.id)).resolves.toBe(before + BigInt(content.length));
    const key = ObjectKey.of(ana.id, document.fileId, input.versionId).value;
    await expect(storage.readObject(key)).resolves.toEqual(content);
  });

  it('CA-10: el mismo guardado dos veces deja una sola versión y no suma el espacio dos veces', async () => {
    const ana = await storage.newClient();
    const document = await uploadEditedDocument(storage, ana);
    const input = editedInput(document, ana.id);
    await registerAsOwner(storage, ana.id, input);
    const used = await usedBytesOf(storage.owner, ana.id);

    const again = await registerAsOwner(storage, ana.id, {
      ...input,
      content: Readable.from([docxBytes()]),
    });

    expect(again).toEqual({ status: 'duplicate', versionId: input.versionId });
    expect((await versionRows(document.fileId)).map((row) => row.numero)).toEqual([1, 2]);
    await expect(usedBytesOf(storage.owner, ana.id)).resolves.toBe(used);
  });

  it('CA-13: al pasar las versiones retenidas poda la más antigua sin violar `ck_usuario_espacio_usado`', async () => {
    const ana = await storage.newClient();
    const document = await uploadEditedDocument(storage, ana);
    const sessions: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const sessionId =
        index === 0
          ? document.sessionId
          : await insertEditSession(storage.owner, {
              ownerId: ana.id,
              fileId: document.fileId,
              versionId: randomUUID(),
            });
      sessions.push(sessionId);
      await registerAsOwner(storage, ana.id, editedInput({ ...document, sessionId }, ana.id));
      await storage.owner.query(
        "UPDATE sesion_edicion SET estado = 'cerrada', finalizada_en = now() WHERE id = $1",
        [sessionId],
      );
    }

    const rows = await versionRows(document.fileId);
    expect(rows.map((row) => row.numero)).toEqual([2, 3, 4]);
    expect(rows.map((row) => row.sesion_edicion_id)).toEqual(sessions);
    const [usage] = await storage.owner.query<{ total: string }[]>(
      'SELECT sum(tamano_bytes)::text AS total FROM version_archivo WHERE archivo_id = $1',
      [document.fileId],
    );
    await expect(usedBytesOf(storage.owner, ana.id)).resolves.toBe(BigInt(usage?.total ?? '0'));
  });

  it('CA-14: un documento que no es `.docx` no se registra, la vigente no cambia y no queda el objeto', async () => {
    const ana = await storage.newClient();
    const document = await uploadEditedDocument(storage, ana);
    const used = await usedBytesOf(storage.owner, ana.id);
    const input = editedInput(document, ana.id, textBytes(2048));

    const outcome = await registerAsOwner(storage, ana.id, input);

    expect(outcome).toEqual({ status: 'corrupt' });
    expect((await versionRows(document.fileId)).map((row) => row.origen)).toEqual(['carga']);
    await expect(usedBytesOf(storage.owner, ana.id)).resolves.toBe(used);
    const key = ObjectKey.of(ana.id, document.fileId, input.versionId).value;
    await expect(storage.versionsOf(key)).resolves.toBe(0);
  });

  it('RN-11: un archivo enviado a la papelera con la sesión abierta registra igual la versión, y su espacio', async () => {
    const ana = await storage.newClient();
    const document = await uploadEditedDocument(storage, ana);
    await storage.owner.query(
      "UPDATE archivo SET eliminado_en = now(), purgar_en = now() + interval '30 days' WHERE id = $1",
      [document.fileId],
    );
    const used = await usedBytesOf(storage.owner, ana.id);
    const content = docxBytes(2048);
    const input = editedInput(document, ana.id, content);

    const outcome = await registerAsOwner(storage, ana.id, input);

    expect(outcome).toMatchObject({ status: 'registered', versionId: input.versionId });
    const [file] = await storage.owner.query<{ version_actual_id: string; eliminado_en: Date }[]>(
      'SELECT version_actual_id, eliminado_en FROM archivo WHERE id = $1',
      [document.fileId],
    );
    expect(file?.version_actual_id).toBe(input.versionId);
    expect(file?.eliminado_en).not.toBeNull();
    await expect(usedBytesOf(storage.owner, ana.id)).resolves.toBe(used + BigInt(content.length));
  });

  it('CA-14: un archivo purgado en plena sesión no registra nada (`file_missing`)', async () => {
    const ana = await storage.newClient();
    const document = await uploadEditedDocument(storage, ana);
    const input = editedInput(document, ana.id);
    await storage.owner.transaction(async (manager) => {
      await manager.query('DELETE FROM version_archivo WHERE archivo_id = $1', [document.fileId]);
      await manager.query('DELETE FROM archivo WHERE id = $1', [document.fileId]);
    });

    const outcome = await registerAsOwner(storage, ana.id, input);

    expect(outcome).toEqual({ status: 'file_missing' });
    const key = ObjectKey.of(ana.id, document.fileId, input.versionId).value;
    await expect(storage.versionsOf(key)).resolves.toBe(0);
  });

  it('CA-14, CA-2: con otra cuenta como actor el archivo no existe: nada se sube ni cambia', async () => {
    const ana = await storage.newClient();
    const bruno = await storage.newClient();
    const document = await uploadEditedDocument(storage, ana);
    const input = editedInput(document, bruno.id);

    const outcome = await registerAsOwner(storage, bruno.id, input);

    expect(outcome).toEqual({ status: 'file_missing' });
    expect(await versionRows(document.fileId)).toHaveLength(1);
    const key = ObjectKey.of(ana.id, document.fileId, input.versionId).value;
    await expect(storage.versionsOf(key)).resolves.toBe(0);
  });
});
