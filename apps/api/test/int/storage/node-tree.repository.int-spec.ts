import { randomUUID } from 'node:crypto';

import type { DataSource, EntityManager } from 'typeorm';

import { InvalidQueryError } from '../../../src/modules/storage/domain/errors';
import { File } from '../../../src/modules/storage/domain/file';
import { FileName } from '../../../src/modules/storage/domain/file-name.vo';
import { Folder } from '../../../src/modules/storage/domain/folder';
import { FolderName } from '../../../src/modules/storage/domain/folder-name.vo';
import type { StorageNode } from '../../../src/modules/storage/domain/storage-node';
import { TypeOrmNodeRepository } from '../../../src/modules/storage/infrastructure/persistence/typeorm-node.repository';
import { createActor, Role } from '../../../src/shared';
import type { Actor } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';

import {
  connectAsAppDatabase,
  insertAccount,
  insertFileWithVersion,
  insertFolder,
  removeAccounts,
} from './storage-test-db';
import type { AppDatabase, FileRowOptions, FolderRow } from './storage-test-db';

const MAX_DEPTH = 10;
const LATER = new Date('2026-10-02T09:00:00.000Z');
/** Fragmento de `accessibleNodes` filtrado por tipo, tal como llega a Postgres. */
const TYPED_ACCESS = /accesibles\.tipo_nodo = '(archivo|carpeta)'/;
const ROOT_INDEXES = /idx_(carpeta|archivo)_raiz_creado/;

const idsOf = (nodes: readonly StorageNode[]): string[] => nodes.map((node) => node.id);

/** `EXPLAIN` con el recorrido secuencial e *index scan* simple desalentados, como en `node.repository.int-spec`. */
const planOf = async (manager: EntityManager, sql: string, parameters: unknown[]) => {
  await manager.query('SET LOCAL enable_seqscan = off');
  await manager.query('SET LOCAL enable_indexscan = off');
  const rows = (await manager.query(`EXPLAIN ${sql}`, parameters)) as { 'QUERY PLAN': string }[];
  return rows.map((row) => row['QUERY PLAN']).join('\n');
};

/** Árbol de carpetas de 006 sobre Postgres como `nimbo_app` dentro de `withActor` (plan 006 §2). */
describe('TypeOrmNodeRepository · carpetas (006 CA-1, CA-3, CA-5, CA-7, CA-9)', () => {
  let owner: DataSource;
  let app: AppDatabase;
  let repository: TypeOrmNodeRepository;
  let ana: Actor;
  let bruno: Actor;
  const created: string[] = [];

  const folderRow = (actor: Actor, name: string, parent: FolderRow | null = null) =>
    insertFolder(owner, actor.id, { name, parent });

  /** Archivo confirmado: `archivo` y su versión en una transacción propia (la FK `version_actual_id` es diferida). */
  const fileRow = (actor: Actor, options: FileRowOptions = {}) =>
    owner.transaction((manager) => insertFileWithVersion(manager, actor.id, options));

  const asAna = <T>(work: () => Promise<T>): Promise<T> => app.asActor(ana, work);

  const loadFolder = async (id: string): Promise<Folder> => {
    const folder = await asAna(() => repository.findAccessibleFolder(ana, id));
    if (folder === null) throw new Error('La carpeta no está accesible');
    return folder;
  };

  beforeAll(async () => {
    owner = await connectAsOwner();
    app = await connectAsAppDatabase();
    repository = new TypeOrmNodeRepository(app.context);
    const accounts = { ana: await insertAccount(owner), bruno: await insertAccount(owner) };
    created.push(accounts.ana, accounts.bruno);
    ana = createActor(accounts.ana, Role.CLIENT);
    bruno = createActor(accounts.bruno, Role.CLIENT);
  });

  afterAll(async () => {
    await app.dataSource.destroy();
    await removeAccounts(owner, created);
    await owner.destroy();
  });

  describe('insertFolder y findAccessibleFolder', () => {
    it('CA-1: guarda la carpeta con su ruta y profundidad y la devuelve como entidad', async () => {
      const parent = await loadFolder((await folderRow(ana, 'Padre')).id);
      const folder = Folder.create({
        id: randomUUID(),
        ownerId: ana.id,
        name: FolderName.of('Hija'),
        parent,
        maxDepth: MAX_DEPTH,
        now: LATER,
      });

      await asAna(() => repository.insertFolder(ana, folder));

      expect((await loadFolder(folder.id)).snapshot()).toEqual(folder.snapshot());
    });

    it('CA-5: una carpeta ajena o en la papelera es `null`', async () => {
      const foreign = await folderRow(bruno, 'De Bruno');
      const trashed = await insertFolder(owner, ana.id, { deletedAt: new Date() });

      for (const id of [foreign.id, trashed.id]) {
        await expect(asAna(() => repository.findAccessibleFolder(ana, id))).resolves.toBeNull();
      }
    });

    it('CA-22: un cliente no puede insertar una carpeta a nombre de otro', async () => {
      const folder = Folder.create({
        id: randomUUID(),
        ownerId: bruno.id,
        name: FolderName.of('Ajena'),
        parent: null,
        maxDepth: MAX_DEPTH,
        now: LATER,
      });

      await expect(asAna(() => repository.insertFolder(ana, folder))).rejects.toThrow(
        /row-level security/,
      );
    });
  });

  describe('listContents', () => {
    it('CA-5: carpetas primero y luego archivos, recientes primero, sin papelera ni hijos de otra carpeta', async () => {
      const box = await folderRow(ana, 'Caja');
      const [olderFolder, newerFolder] = [
        await folderRow(ana, 'A', box),
        await folderRow(ana, 'B', box),
      ];
      await folderRow(ana, 'Nieta', olderFolder);
      await insertFolder(owner, ana.id, { parent: box, deletedAt: new Date() });
      const older = await fileRow(ana, { folderId: box.id });
      const newer = await fileRow(ana, { folderId: box.id });
      await fileRow(ana, { folderId: box.id, deletedAt: new Date() });

      const [first, second] = await asAna(async () => {
        const page = await repository.listContents(ana, { folderId: box.id, limit: 3 });
        const next = await repository.listContents(ana, {
          folderId: box.id,
          limit: 3,
          cursor: page.nextCursor ?? '',
        });
        return [page, next];
      });

      expect(idsOf(first.items)).toEqual([newerFolder.id, olderFolder.id, newer.fileId]);
      expect(idsOf(second.items)).toEqual([older.fileId]);
      expect(second.nextCursor).toBeNull();
    });

    it('CA-5: el cursor cruza de carpetas a archivos cuando la página termina justo en la última carpeta', async () => {
      const box = await folderRow(ana, 'Borde');
      const only = await folderRow(ana, 'Única', box);
      const file = await fileRow(ana, { folderId: box.id });

      const [first, second] = await asAna(async () => {
        const page = await repository.listContents(ana, { folderId: box.id, limit: 1 });
        const next = await repository.listContents(ana, {
          folderId: box.id,
          limit: 1,
          cursor: page.nextCursor ?? '',
        });
        return [page, next];
      });

      expect(idsOf(first.items)).toEqual([only.id]);
      expect(idsOf(second.items)).toEqual([file.fileId]);
      expect(second.nextCursor).toBeNull();
    });

    it('CA-5: la raíz solo lista lo que no tiene carpeta, y un cliente no ve lo ajeno', async () => {
      const carla = createActor(await insertAccount(owner), Role.CLIENT);
      created.push(carla.id);
      const top = await folderRow(carla, 'Raíz de Carla');
      await folderRow(carla, 'Dentro', top);
      const loose = await fileRow(carla);
      await fileRow(carla, { folderId: top.id });
      await folderRow(bruno, 'Raíz de Bruno');

      const page = await app.asActor(carla, () =>
        repository.listContents(carla, { folderId: null, limit: 50 }),
      );

      expect(idsOf(page.items)).toEqual([top.id, loose.fileId]);
    });

    it('CA-5: un cursor que no emitió el repositorio es `InvalidQueryError`', async () => {
      await expect(
        asAna(() => repository.listContents(ana, { folderId: null, limit: 3, cursor: 'basura' })),
      ).rejects.toBeInstanceOf(InvalidQueryError);
    });

    it('R-2: en la raíz usa los índices parciales de raíz y filtra el fragmento por `tipo_nodo`', async () => {
      const plans = await app.asActor(ana, async (manager) => {
        const runner = manager.queryRunner;
        if (runner === undefined) throw new Error('withActor no abrió un QueryRunner');
        const spy = jest.spyOn(runner, 'query');
        await repository.listContents(ana, { folderId: null, limit: 5 });
        const queries = spy.mock.calls.map(([sql, parameters]) => ({ sql, parameters }));
        spy.mockRestore();
        const explained: string[] = [];
        for (const query of queries) {
          expect(query.sql).toMatch(TYPED_ACCESS);
          explained.push(await planOf(manager, query.sql, query.parameters ?? []));
        }
        return explained;
      });

      expect(plans).toHaveLength(2);
      plans.forEach((plan) => expect(plan).toMatch(ROOT_INDEXES));
    });
  });

  describe('breadcrumbs y maxSubtreeDepth', () => {
    it('CA-5: las migas van desde la raíz hasta el padre, en orden', async () => {
      const first = await folderRow(ana, 'Uno');
      const second = await folderRow(ana, 'Dos', first);
      const third = await loadFolder((await folderRow(ana, 'Tres', second)).id);

      const crumbs = await asAna(() => repository.breadcrumbs(ana, third));

      expect(crumbs.map((crumb) => crumb.name.value)).toEqual(['Uno', 'Dos']);
      await expect(
        asAna(async () => repository.breadcrumbs(ana, await loadFolder(first.id))),
      ).resolves.toEqual([]);
    });

    it('CA-9: la profundidad más honda del subárbol vivo, o la propia si no tiene hijas', async () => {
      const root = await folderRow(ana, 'Hondo');
      const child = await folderRow(ana, 'H1', root);
      const grandchild = await folderRow(ana, 'H2', child);
      await insertFolder(owner, ana.id, { parent: grandchild, deletedAt: new Date() });

      const [deepest, leaf] = await asAna(async () => [
        await repository.maxSubtreeDepth(ana, await loadFolder(root.id)),
        await repository.maxSubtreeDepth(ana, await loadFolder(child.id)),
      ]);

      expect(deepest).toBe(3);
      expect(leaf).toBe(3);
    });
  });

  describe('nombres ocupados por carpeta', () => {
    it('CA-3: carpetas hermanas vivas y sus copias «(n)», sin distinguir mayúsculas y sin la que cambia', async () => {
      const parent = await folderRow(ana, 'Nombres');
      const same = await folderRow(ana, 'Ñandú', parent);
      await folderRow(ana, 'ñandú (1)', parent);
      await folderRow(ana, 'Ñandú', await folderRow(ana, 'Otra'));
      await insertFolder(owner, ana.id, { name: 'ÑANDÚ (2)', parent, deletedAt: new Date() });

      const [all, others] = await asAna(async () => [
        await repository.findTakenFolderNames(ana, FolderName.of('ÑANDÚ'), parent.id),
        await repository.findTakenFolderNames(ana, FolderName.of('ÑANDÚ'), parent.id, same.id),
      ]);

      expect([...all].sort()).toEqual(['Ñandú', 'ñandú (1)']);
      expect(others).toEqual(['ñandú (1)']);
    });

    it('005 CA-6 en 006: los archivos ocupados se buscan en su carpeta, no en la raíz', async () => {
      const parent = await folderRow(ana, 'Archivos');
      await fileRow(ana, { name: 'acta.pdf', folderId: parent.id });

      const [inFolder, inRoot] = await asAna(async () => [
        await repository.findTakenNames(ana, FileName.of('ACTA.pdf'), parent.id),
        await repository.findTakenNames(ana, FileName.of('ACTA.pdf'), null),
      ]);

      expect(inFolder).toEqual(['acta.pdf']);
      expect(inRoot).toEqual([]);
    });
  });

  describe('renombrar y mover', () => {
    it('CA-4: renombra una carpeta y un archivo propios', async () => {
      const folder = await loadFolder((await folderRow(ana, 'Antes')).id);
      const { fileId } = await fileRow(ana, { name: 'antes.pdf' });

      await asAna(async () => {
        const file = await repository.findAccessibleById(ana, fileId);
        if (file === null) throw new Error('El archivo no está accesible');
        await repository.renameFolder(
          ana,
          Folder.rehydrate({
            ...folder.snapshot(),
            name: FolderName.of('Después'),
            updatedAt: LATER,
          }),
        );
        await repository.renameFile(
          ana,
          File.rehydrate({
            ...file.snapshot(),
            name: FileName.of('después.pdf'),
            updatedAt: LATER,
          }),
        );
      });

      const [carpeta] = (await owner.query(
        'SELECT nombre, actualizado_en FROM carpeta WHERE id = $1',
        [folder.id],
      )) as { nombre: string; actualizado_en: Date }[];
      const [archivo] = (await owner.query('SELECT nombre FROM archivo WHERE id = $1', [
        fileId,
      ])) as {
        nombre: string;
      }[];
      expect(carpeta).toEqual({ nombre: 'Después', actualizado_en: LATER });
      expect(archivo?.nombre).toBe('después.pdf');
    });

    it('CA-22: renombrar una carpeta ajena no cambia nada', async () => {
      const foreign = await folderRow(bruno, 'Intacta');
      const forged = Folder.create({
        id: foreign.id,
        ownerId: bruno.id,
        name: FolderName.of('Cambiada'),
        parent: null,
        maxDepth: MAX_DEPTH,
        now: LATER,
      });

      await asAna(() => repository.renameFolder(ana, forged));

      const [row] = (await owner.query('SELECT nombre FROM carpeta WHERE id = $1', [
        foreign.id,
      ])) as {
        nombre: string;
      }[];
      expect(row?.nombre).toBe('Intacta');
    });

    it('CA-7: mueve un archivo a una carpeta con su nombre final', async () => {
      const target = await folderRow(ana, 'Destino de archivo');
      const { fileId } = await fileRow(ana, { name: 'mover.pdf' });

      await asAna(async () => {
        const file = await repository.findAccessibleById(ana, fileId);
        if (file === null) throw new Error('El archivo no está accesible');
        await repository.moveFile(
          ana,
          File.rehydrate({
            ...file.snapshot(),
            folderId: target.id,
            name: FileName.of('mover (1).pdf'),
          }),
        );
      });

      const [row] = (await owner.query('SELECT carpeta_id, nombre FROM archivo WHERE id = $1', [
        fileId,
      ])) as { carpeta_id: string; nombre: string }[];
      expect(row).toEqual({ carpeta_id: target.id, nombre: 'mover (1).pdf' });
    });

    it('CA-7: mueve la carpeta y reubica la ruta y la profundidad de todo su subárbol, también lo eliminado aparte', async () => {
      const source = await folderRow(ana, 'Origen');
      const child = await folderRow(ana, 'Hija', source);
      const trashed = await insertFolder(owner, ana.id, { parent: child, deletedAt: new Date() });
      const destination = await folderRow(ana, 'Nido', await folderRow(ana, 'Arriba'));
      const sibling = await folderRow(ana, 'Origen-bis');

      await asAna(async () => {
        const before = await loadFolder(source.id);
        const parent = await loadFolder(destination.id);
        const moved = Folder.rehydrate({
          ...before.snapshot(),
          parentId: parent.id,
          path: before.path.rebase(before.path, parent.path),
          updatedAt: LATER,
        });
        await repository.moveFolderSubtree(ana, before, moved);
      });

      const rows = (await owner.query(
        'SELECT id, carpeta_padre_id, ruta, profundidad FROM carpeta WHERE id = ANY($1)',
        [[source.id, child.id, trashed.id, sibling.id]],
      )) as { id: string; carpeta_padre_id: string | null; ruta: string; profundidad: number }[];
      const byId = new Map(rows.map((row) => [row.id, row]));
      const base = `${destination.path}${source.id}/`;
      expect(byId.get(source.id)).toMatchObject({
        carpeta_padre_id: destination.id,
        ruta: base,
        profundidad: 3,
      });
      expect(byId.get(child.id)).toMatchObject({ ruta: `${base}${child.id}/`, profundidad: 4 });
      expect(byId.get(trashed.id)).toMatchObject({
        ruta: `${base}${child.id}/${trashed.id}/`,
        profundidad: 5,
      });
      expect(byId.get(sibling.id)).toMatchObject({ ruta: sibling.path, profundidad: 1 });
    });
  });
});
