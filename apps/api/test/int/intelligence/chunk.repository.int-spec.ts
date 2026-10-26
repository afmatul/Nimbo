import { randomUUID } from 'node:crypto';

import type { DataSource } from 'typeorm';

import type { ChunkToStore } from '../../../src/modules/intelligence/application/ports/i-chunk-repository.port';
import { TypeOrmChunkRepository } from '../../../src/modules/intelligence/infrastructure/persistence/typeorm-chunk.repository';
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

import { axisVector, countRows } from './intelligence-test-db';
import type { IndexedVersionRow } from './intelligence-test-db';

/** Más que un lote de inserción: el reemplazo parte la escritura sin perder fragmentos. */
const MANY_CHUNKS = 230;

const chunk = (order: number, axis = order): ChunkToStore => ({
  order,
  text: `Las ventas del trimestre ${order} crecieron`,
  location: { tipo: 'texto', lineaDesde: order + 1, lineaHasta: order + 1, confianza: 1 },
  embedding: axisVector(axis),
});

/** `TypeOrmChunkRepository` contra el Postgres del arnés como `nimbo_app` (plan 019 §2, DF-14). */
describe('TypeOrmChunkRepository (plan 019 §2)', () => {
  let owner: DataSource;
  let app: AppDatabase;
  let repository: TypeOrmChunkRepository;
  let ana: Actor;
  let bruno: Actor;
  let support: Actor;
  const created: string[] = [];

  const fileOf = (actor: Actor, deletedAt: Date | null = null): Promise<IndexedVersionRow> =>
    app.asActor(actor, (manager) => insertFileWithVersion(manager, actor.id, { deletedAt }));

  const store = (
    actor: Actor,
    version: IndexedVersionRow,
    chunks: readonly ChunkToStore[],
  ): Promise<void> =>
    app.asActor(actor, () => repository.replaceForVersion(actor, version, chunks));

  const ordersOf = async (actor: Actor, fileId: string): Promise<number[]> =>
    (await app.asActor(actor, () => repository.findByFile(actor, fileId))).map((row) => row.order);

  const nearestFiles = async (actor: Actor, axis: number, limit = 5): Promise<string[]> =>
    (await app.asActor(actor, () => repository.nearest(actor, axisVector(axis), limit))).map(
      (row) => row.fileId,
    );

  beforeAll(async () => {
    owner = await connectAsOwner();
    app = await connectAsAppDatabase();
    repository = new TypeOrmChunkRepository(app.context);
    const ids = await owner.transaction(async (manager) => [
      await insertAccount(manager),
      await insertAccount(manager),
      await insertAccount(manager, Role.SUPPORT),
    ]);
    created.push(...ids);
    ana = createActor(ids[0] ?? '', Role.CLIENT);
    bruno = createActor(ids[1] ?? '', Role.CLIENT);
    support = createActor(ids[2] ?? '', Role.SUPPORT);
  });

  afterAll(async () => {
    await app.dataSource.destroy();
    await removeAccounts(owner, created);
    await owner.destroy();
  });

  it('CA-1: guarda los fragmentos con su procedencia y los lee por orden, sin el vector', async () => {
    const version = await fileOf(ana);

    await store(ana, version, [chunk(1), chunk(0)]);
    const [first] = await app.asActor(ana, () => repository.findByFile(ana, version.fileId));

    expect(await ordersOf(ana, version.fileId)).toEqual([0, 1]);
    expect(first).toEqual({
      id: expect.any(String),
      ...version,
      order: 0,
      text: 'Las ventas del trimestre 0 crecieron',
      location: { tipo: 'texto', lineaDesde: 1, lineaHasta: 1, confianza: 1 },
    });
  });

  it('CA-9: reprocesar la misma versión deja un solo juego de fragmentos', async () => {
    const version = await fileOf(ana);

    await store(ana, version, [chunk(0), chunk(1), chunk(2)]);
    await store(ana, version, [chunk(0), chunk(1)]);

    expect(await ordersOf(ana, version.fileId)).toEqual([0, 1]);
  });

  it('CA-10: los fragmentos de una versión nueva reemplazan a los de la anterior', async () => {
    const version = await fileOf(ana);
    await store(ana, version, [chunk(0), chunk(1)]);
    const newer = { fileId: version.fileId, versionId: randomUUID() };
    await owner.query(
      `INSERT INTO version_archivo (id, archivo_id, origen, clave_objeto, tamano_bytes, creado_por, creada_en, numero)
       VALUES ($1, $2, 'carga', $3, 10, $4, now(), 2)`,
      [newer.versionId, version.fileId, `u/${ana.id}/${version.fileId}/${newer.versionId}`, ana.id],
    );

    await store(ana, newer, [chunk(0)]);
    const rows = await app.asActor(ana, () => repository.findByFile(ana, version.fileId));

    expect(rows.map((row) => row.versionId)).toEqual([newer.versionId]);
  });

  it('CA-11: guarda en lotes una versión con muchos fragmentos', async () => {
    const version = await fileOf(ana);

    await store(
      ana,
      version,
      Array.from({ length: MANY_CHUNKS }, (_value, order) => chunk(order, 0)),
    );

    await expect(countRows(owner, 'fragmento', version.fileId)).resolves.toBe(MANY_CHUNKS);
  });

  it('CA-17: otro cliente no lee por id los fragmentos de un archivo ajeno', async () => {
    const version = await fileOf(ana);
    await store(ana, version, [chunk(0)]);

    await expect(ordersOf(bruno, version.fileId)).resolves.toEqual([]);
  });

  it('CA-17: por similitud solo aparecen los archivos propios aunque uno ajeno sea idéntico', async () => {
    const anaVersion = await fileOf(ana);
    const brunoVersion = await fileOf(bruno);
    await store(ana, anaVersion, [chunk(0, 700)]);
    await store(bruno, brunoVersion, [chunk(0, 700), chunk(1, 701)]);

    const asBruno = await nearestFiles(bruno, 700);

    expect(asBruno).toEqual([brunoVersion.fileId, brunoVersion.fileId]);
    expect(asBruno).not.toContain(anaVersion.fileId);
  });

  it('CA-17: ordena por distancia coseno y respeta el límite', async () => {
    const version = await fileOf(bruno);
    await store(bruno, version, [chunk(0, 702), chunk(1, 703), chunk(2, 704)]);

    const rows = await app.asActor(bruno, () => repository.nearest(bruno, axisVector(703), 1));

    expect(rows.map((row) => [row.fileId, row.order])).toEqual([[version.fileId, 1]]);
  });

  it('CA-15: un archivo en la papelera no es recuperable ni por id ni por similitud', async () => {
    const trashed = await fileOf(ana, new Date());
    await store(ana, trashed, [chunk(0, 705)]);

    await expect(ordersOf(ana, trashed.fileId)).resolves.toEqual([]);
    await expect(nearestFiles(ana, 705)).resolves.not.toContain(trashed.fileId);
  });

  it('CA-20: un rol interno no recibe fragmentos ni por id ni por similitud', async () => {
    const version = await fileOf(ana);
    await store(ana, version, [chunk(0, 706)]);

    await expect(ordersOf(support, version.fileId)).resolves.toEqual([]);
    await expect(nearestFiles(support, 706)).resolves.toEqual([]);
  });

  it('CA-17: un cliente no escribe fragmentos sobre un archivo ajeno (RLS)', async () => {
    const version = await fileOf(ana);

    await expect(store(bruno, version, [chunk(0)])).rejects.toThrow(/row-level security/);
  });

  it('RNF-05: sin `withActor` no consulta (`requireActorScope`)', async () => {
    await expect(repository.findByFile(ana, randomUUID())).rejects.toThrow(ActorScopeMissingError);
  });
});
