import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';

import { IndexableFileGateway } from '../../../src/modules/storage';
import type { FileVersionRef } from '../../../src/modules/storage';
import { createActor, I_TRANSACTION_RUNNER, Role } from '../../../src/shared';
import type { Actor, ITransactionRunner } from '../../../src/shared';

import { createStorageHttpApp } from './storage-http';
import type { StorageHttpApp } from './storage-http';
import { insertAccount, insertFileWithVersion } from './storage-test-db';

const CONTENT = Buffer.from('contenido de la versión vigente', 'utf8');
const LOCK_TIMEOUT = "SET LOCAL lock_timeout = '300ms'";
/** Páginas grandes para recorrer todas las cuentas de la base compartida del arnés. */
const SCAN_PAGE = 500;

const readAll = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
};

/**
 * Fachada de `storage` para `intelligence` (plan 019 §2, T-05) contra Postgres como `nimbo_app` (RLS) y MinIO reales:
 * cada lectura pasa por `accessibleNodes` u `ownedFiles` del actor, `lockCurrentVersion` toma `FOR SHARE` bajo RLS
 * dentro de la transacción del llamador y `clientIds` devuelve solo UUID de clientes.
 */
describe('IndexableFileGateway (019 T-05, plan §2)', () => {
  let storage: StorageHttpApp;
  let gateway: IndexableFileGateway;
  let transactions: ITransactionRunner;
  let ana: Actor;
  let bruno: Actor;

  beforeAll(async () => {
    storage = await createStorageHttpApp();
    gateway = storage.testApp.app.get(IndexableFileGateway);
    transactions = storage.testApp.app.get<ITransactionRunner>(I_TRANSACTION_RUNNER);
    ana = createActor((await storage.newClient()).id, Role.CLIENT);
    bruno = createActor((await storage.newClient()).id, Role.CLIENT);
  });

  afterAll(async () => {
    await storage?.close();
  });

  /** `archivo` y su versión en una transacción: la FK `version_actual_id` es diferida. */
  const insertFile = (ownerId: string, options: { deletedAt?: Date } = {}) =>
    storage.owner.transaction((manager) => insertFileWithVersion(manager, ownerId, options));

  const anaFile = (options: { deletedAt?: Date } = {}) => insertFile(ana.id, options);

  const refOf = ({ fileId, versionId }: { fileId: string; versionId: string }): FileVersionRef => ({
    fileId,
    versionId,
  });

  it('`findAccessible` da el archivo vivo propio con su versión vigente; ajeno o en la papelera = `null`', async () => {
    const live = await anaFile();
    const trashed = await anaFile({ deletedAt: new Date() });

    expect(await gateway.findAccessible(ana, live.fileId)).toEqual({
      id: live.fileId,
      ownerId: ana.id,
      kind: 'pdf',
      sizeBytes: 1024n,
      currentVersionId: live.versionId,
    });
    expect(await gateway.findAccessible(bruno, live.fileId)).toBeNull();
    expect(await gateway.findAccessible(ana, trashed.fileId)).toBeNull();
  });

  it('`findOwned` incluye la papelera (PD-112) y filtra por propietario: ajeno o rol interno = `null`', async () => {
    const trashed = await anaFile({ deletedAt: new Date() });
    const support = createActor(ana.id, Role.SUPPORT);

    expect((await gateway.findOwned(ana, trashed.fileId))?.currentVersionId).toBe(
      trashed.versionId,
    );
    expect(await gateway.findOwned(bruno, trashed.fileId)).toBeNull();
    expect(await gateway.findOwned(support, trashed.fileId)).toBeNull();
  });

  it('`openCurrent` entrega el contenido solo de la versión vigente y del propietario', async () => {
    const file = await anaFile();
    await storage.putObject(`u/${ana.id}/${file.fileId}/${file.versionId}`, CONTENT);

    const current = await gateway.openCurrent(ana, refOf(file));

    expect(current).not.toBeNull();
    expect(await readAll(current as Readable)).toEqual(CONTENT);
    expect(await gateway.openCurrent(ana, { ...refOf(file), versionId: randomUUID() })).toBeNull();
    expect(await gateway.openCurrent(bruno, refOf(file))).toBeNull();
  });

  it('`openCurrent` sin el objeto en MinIO (purgado) responde `null`', async () => {
    const file = await anaFile();

    expect(await gateway.openCurrent(ana, refOf(file))).toBeNull();
  });

  it('`lockCurrentVersion` es `true` solo para la versión vigente propia, dentro de la transacción del llamador', async () => {
    const file = await anaFile();

    const [current, stale, foreign] = await Promise.all([
      transactions.withActor(ana, () => gateway.lockCurrentVersion(ana, refOf(file))),
      transactions.withActor(ana, () =>
        gateway.lockCurrentVersion(ana, { ...refOf(file), versionId: randomUUID() }),
      ),
      transactions.withActor(bruno, () => gateway.lockCurrentVersion(bruno, refOf(file))),
    ]);

    expect([current, stale, foreign]).toEqual([true, false, false]);
  });

  it('plan §7 punto 2: `lockCurrentVersion` toma `FOR SHARE` bajo RLS: nadie mueve la versión vigente hasta el commit', async () => {
    const file = await anaFile();

    await transactions.withActor(ana, async () => {
      expect(await gateway.lockCurrentVersion(ana, refOf(file))).toBe(true);
      await expect(
        storage.owner.transaction(async (manager) => {
          await manager.query(LOCK_TIMEOUT);
          await manager.query('UPDATE archivo SET actualizado_en = now() WHERE id = $1', [
            file.fileId,
          ]);
        }),
      ).rejects.toThrow(/lock timeout/);
    });
  });

  it('`lockCurrentVersion` fuera de una transacción con actor lanza: no hay bloqueo sin alcance', async () => {
    const file = await anaFile();

    await expect(gateway.lockCurrentVersion(ana, refOf(file))).rejects.toThrow();
  });

  it('`listIndexable` pagina por id los archivos propios (vivos y en la papelera), sin los ajenos', async () => {
    const owner = createActor(await insertAccount(storage.owner), Role.CLIENT);
    const files = await Promise.all([
      insertFile(owner.id),
      insertFile(owner.id, { deletedAt: new Date() }),
      insertFile(owner.id),
    ]);
    await insertFile(bruno.id);
    const expected = files.map((file) => file.fileId).sort();

    const first = await gateway.listIndexable(owner, { afterId: null, limit: 2 });
    const second = await gateway.listIndexable(owner, {
      afterId: first.at(-1)?.id ?? null,
      limit: 2,
    });

    expect([...first, ...second].map((file) => file.id)).toEqual(expected);
    expect(second).toHaveLength(1);
    expect(first[0]?.ownerId).toBe(owner.id);
    await storage.owner.query('DELETE FROM archivo WHERE propietario_id = $1', [owner.id]);
    await storage.owner.query('DELETE FROM usuario WHERE id = $1', [owner.id]);
  });

  it('`clientIds` recorre solo UUID de cuentas de cliente, en orden ascendente', async () => {
    const admin = await insertAccount(storage.owner, Role.ADMIN);
    const seen: string[] = [];
    let afterId: string | null = null;
    for (;;) {
      const page: readonly string[] = await gateway.clientIds({ afterId, limit: SCAN_PAGE });
      seen.push(...page);
      if (page.length < SCAN_PAGE) break;
      afterId = page.at(-1) ?? null;
    }

    expect(seen).toEqual(expect.arrayContaining([ana.id, bruno.id]));
    expect(seen).not.toContain(admin);
    expect([...seen].sort()).toEqual(seen);
    await storage.owner.query('DELETE FROM usuario WHERE id = $1', [admin]);
  });
});
