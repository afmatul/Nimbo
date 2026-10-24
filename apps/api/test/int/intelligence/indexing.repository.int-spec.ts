import { randomUUID } from 'node:crypto';

import type { DataSource } from 'typeorm';

import { FileIndexing } from '../../../src/modules/intelligence/domain/file-indexing';
import { TypeOrmIndexingRepository } from '../../../src/modules/intelligence/infrastructure/persistence/typeorm-indexing.repository';
import type { Actor } from '../../../src/shared';
import { createActor, Role } from '../../../src/shared';
import { ActorScopeMissingError } from '../../../src/shared/infrastructure/persistence/actor-scope.errors';
import { connectAsOwner } from '../../support/database-urls';
import type { AppDatabase } from '../storage/storage-test-db';
import {
  connectAsAppDatabase,
  insertAccount,
  insertFileWithVersion,
  removeAccounts,
} from '../storage/storage-test-db';

import { countRows } from './intelligence-test-db';
import type { IndexedVersionRow } from './intelligence-test-db';

const NOW = new Date('2026-10-21T10:00:00.000Z');
const LATER = new Date('2026-10-21T10:02:00.000Z');

const pendingFor = (version: IndexedVersionRow): FileIndexing =>
  FileIndexing.pending({ id: randomUUID(), ...version, now: NOW });

/** `TypeOrmIndexingRepository` contra el Postgres del arnés como `nimbo_app` (plan 019 §2). */
describe('TypeOrmIndexingRepository (plan 019 §2)', () => {
  let owner: DataSource;
  let app: AppDatabase;
  let repository: TypeOrmIndexingRepository;
  let ana: Actor;
  let bruno: Actor;
  const created: string[] = [];

  const anaFile = (): Promise<IndexedVersionRow> =>
    app.asActor(ana, (manager) => insertFileWithVersion(manager, ana.id));

  const insertPending = async (version: IndexedVersionRow): Promise<FileIndexing> => {
    const indexing = pendingFor(version);
    await app.asActor(ana, () => repository.insertIfAbsent(ana, indexing));
    return indexing;
  };

  beforeAll(async () => {
    owner = await connectAsOwner();
    app = await connectAsAppDatabase();
    repository = new TypeOrmIndexingRepository(app.context);
    const ids = await owner.transaction(async (manager) => [
      await insertAccount(manager),
      await insertAccount(manager),
    ]);
    created.push(...ids);
    ana = createActor(ids[0] ?? '', Role.CLIENT);
    bruno = createActor(ids[1] ?? '', Role.CLIENT);
  });

  afterAll(async () => {
    await app.dataSource.destroy();
    await removeAccounts(owner, created);
    await owner.destroy();
  });

  it('CA-9: el mismo evento dos veces deja una sola fila y no aborta la transacción', async () => {
    const version = await anaFile();

    const [first, second, rows] = await app.asActor(ana, async (manager) => [
      await repository.insertIfAbsent(ana, pendingFor(version)),
      await repository.insertIfAbsent(ana, pendingFor(version)),
      await countRows(manager, 'indexacion', version.fileId),
    ]);

    expect([first, second, rows]).toEqual([true, false, 1]);
  });

  it('CA-13: lee la indexación de una versión tal como se guardó', async () => {
    const indexing = await insertPending(await anaFile());

    const found = await app.asActor(ana, () => repository.findByVersion(ana, indexing.versionId));

    expect(found?.snapshot()).toEqual(indexing.snapshot());
  });

  it('CA-17: otro cliente no ve la indexación de un archivo ajeno', async () => {
    const indexing = await insertPending(await anaFile());

    await expect(
      app.asActor(bruno, () => repository.findByVersion(bruno, indexing.versionId)),
    ).resolves.toBeNull();
  });

  it('CA-9: el reclamo es comparar y asignar: el segundo desde `pendiente` pierde', async () => {
    const indexing = await insertPending(await anaFile());
    const claimed = indexing.claim(LATER);

    const results = await app.asActor(ana, async () => [
      await repository.compareAndSet(ana, claimed, 'pendiente'),
      await repository.compareAndSet(ana, claimed, 'pendiente'),
    ]);
    const stored = await app.asActor(ana, () => repository.findByVersion(ana, indexing.versionId));

    expect(results).toEqual([true, false]);
    expect(stored?.snapshot()).toEqual(claimed.snapshot());
  });

  it('CA-13: guarda el `fallido` con su motivo y luego «Reintentar» lo vuelve a `pendiente`', async () => {
    const claimed = (await insertPending(await anaFile())).claim(LATER);
    const failed = claimed.fail('proveedor_no_disponible', { durationMs: 900, now: LATER });
    const retried = failed.retry(LATER);

    await app.asActor(ana, async () => {
      await repository.compareAndSet(ana, claimed, 'pendiente');
      await repository.compareAndSet(ana, failed, 'indexando');
      await repository.compareAndSet(ana, retried, 'fallido');
    });
    const stored = await app.asActor(ana, () => repository.findByVersion(ana, claimed.versionId));

    expect(stored?.state).toBe('pendiente');
    expect(stored?.snapshot()).toMatchObject({ reason: null, attempts: 0, durationMs: null });
  });

  it('CA-17: otro cliente no cambia el estado de un archivo ajeno', async () => {
    const indexing = await insertPending(await anaFile());

    await expect(
      app.asActor(bruno, () => repository.compareAndSet(bruno, indexing.claim(LATER), 'pendiente')),
    ).resolves.toBe(false);
  });

  it('CA-10: al indexar una versión nueva se borran las filas de las demás versiones del archivo', async () => {
    const version = await anaFile();
    await insertPending(version);
    const newer = { fileId: version.fileId, versionId: await insertNewerVersion(owner, version) };
    const current = await insertPending(newer);

    const deleted = await app.asActor(ana, () => repository.deleteOtherVersions(ana, current));
    const remaining = await app.asActor(ana, async () => [
      await repository.findByVersion(ana, version.versionId),
      await repository.findByVersion(ana, newer.versionId),
    ]);

    expect(deleted).toBe(1);
    expect(remaining.map((row) => row?.versionId ?? null)).toEqual([null, newer.versionId]);
  });

  it('RNF-05: sin `withActor` no consulta (`requireActorScope`)', async () => {
    await expect(repository.findByVersion(ana, randomUUID())).rejects.toThrow(
      ActorScopeMissingError,
    );
  });
});

/** Versión 2 del archivo, vigente desde ahora (como el dueño: la *fixture* no pasa por `storage`). */
async function insertNewerVersion(owner: DataSource, current: IndexedVersionRow): Promise<string> {
  const id = randomUUID();
  await owner.transaction(async (manager) => {
    await manager.query(
      `INSERT INTO version_archivo (id, archivo_id, origen, clave_objeto, tamano_bytes, creado_por, creada_en, numero)
       SELECT $1, v.archivo_id, 'carga', v.clave_objeto || '-2', v.tamano_bytes, v.creado_por, now(), 2
         FROM version_archivo v WHERE v.id = $2`,
      [id, current.versionId],
    );
    await manager.query('UPDATE archivo SET version_actual_id = $1 WHERE id = $2', [
      id,
      current.fileId,
    ]);
  });
  return id;
}
