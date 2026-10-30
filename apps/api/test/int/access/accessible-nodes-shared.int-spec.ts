import { randomUUID } from 'node:crypto';

import type { DataSource, EntityManager, QueryRunner } from 'typeorm';

import { accessibleNodes, ownedNodes } from '../../../src/modules/access';
import type { AccessibleNodesFragment } from '../../../src/modules/access';
import { createActor, Role } from '../../../src/shared';
import type { Actor } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import { insertShare } from '../sharing/sharing-test-db';
import {
  connectAsAppDatabase,
  inRolledBackTransaction,
  insertAccount,
  insertFileWithVersion,
  insertFolder,
  refreshNodeStatistics,
  removeAccounts,
} from '../storage/storage-test-db';
import type { AppDatabase } from '../storage/storage-test-db';

interface NodeRow {
  nodo_id: string;
  tipo_nodo: string;
  nivel: string;
}

/** Ejecuta el fragmento como lo usan los repositorios: dentro de la transacción del actor, como `nimbo_app`. */
const nodesOf = async (
  manager: EntityManager,
  fragment: AccessibleNodesFragment,
): Promise<NodeRow[]> => {
  const [sql, values] = manager.connection.driver.escapeQueryWithParameters(
    `SELECT nodo_id, tipo_nodo, nivel FROM (${fragment.sql}) accesibles`,
    fragment.parameters,
    {},
  );
  const rows = (await manager.query(sql, values)) as NodeRow[];
  return rows.sort((left, right) => left.nodo_id.localeCompare(right.nodo_id));
};

const byId = (rows: readonly NodeRow[]): NodeRow[] =>
  [...rows].sort((left, right) => left.nodo_id.localeCompare(right.nodo_id));

const idsOf = (rows: readonly NodeRow[]): string[] => rows.map((row) => row.nodo_id);

/** Volumen para que el planificador elija como en producción (con tablas casi vacías, cualquier índice le da igual). */
const MANY_FOLDERS = 2000;

const planText = (rows: unknown): string =>
  (rows as Record<string, string>[]).map((row) => Object.values(row).join('')).join('\n');

/** Cinco cuentas con `count` subcarpetas cada una bajo una carpeta raíz (solo dentro de una transacción revertida). */
const seedManyFolders = async (runner: QueryRunner, count: number): Promise<void> => {
  for (let account = 0; account < 5; account += 1) {
    const ownerId = await insertAccount(runner);
    const root = await insertFolder(runner, ownerId);
    await runner.query(
      `INSERT INTO carpeta (id, propietario_id, carpeta_padre_id, nombre, ruta, profundidad, creado_en, actualizado_en)
       SELECT n.id, $1, $2, 'c-' || n.id, $3 || n.id || '/', 2, now(), now()
         FROM (SELECT gen_random_uuid() AS id FROM generate_series(1, $4::int)) n`,
      [ownerId, root.id, root.path, count],
    );
  }
};

/**
 * Rama compartida de `accessibleNodes` y `ownedNodes` contra el Postgres del arnés (spec 012 CA-13, CA-17, CA-21;
 * plan §3, §6, R-3). Ana comparte con Bruno; Carla no recibe nada. Las comparticiones se insertan como Ana.
 */
describe('accessibleNodes con comparticiones (012 CA-13, CA-17, CA-21)', () => {
  let owner: DataSource;
  let app: AppDatabase;
  let ana: Actor;
  let bruno: Actor;
  let carla: Actor;
  const created: string[] = [];
  const tree = { folder: '', subfolder: '', inFolder: '', inSubfolder: '', alone: '', other: '' };
  const brunoFile = { id: '' };

  const accessible = (actor: Actor): Promise<NodeRow[]> =>
    app.asActor(actor, (manager) => nodesOf(manager, accessibleNodes(actor)));

  const setTrashed = (fileId: string, deletedAt: Date | null): Promise<unknown> =>
    owner.query('UPDATE archivo SET eliminado_en = $2, purgar_en = $2 WHERE id = $1', [
      fileId,
      deletedAt,
    ]);

  const setAccountState = (accountId: string, state: string): Promise<unknown> =>
    owner.query('UPDATE usuario SET estado = $2 WHERE id = $1', [accountId, state]);

  /** Carpeta con subcarpeta y un archivo en cada una, más dos archivos sueltos en la raíz; todo de Ana. */
  const seedAnaTree = (): Promise<void> =>
    app.asActor(ana, async (manager) => {
      const folder = await insertFolder(manager, ana.id);
      const subfolder = await insertFolder(manager, ana.id, { parent: folder });
      tree.folder = folder.id;
      tree.subfolder = subfolder.id;
      tree.inFolder = (
        await insertFileWithVersion(manager, ana.id, { folderId: folder.id })
      ).fileId;
      tree.inSubfolder = (
        await insertFileWithVersion(manager, ana.id, { folderId: subfolder.id })
      ).fileId;
      tree.alone = (await insertFileWithVersion(manager, ana.id)).fileId;
      tree.other = (await insertFileWithVersion(manager, ana.id)).fileId;
    });

  /** Carpeta como `EDITOR`, un archivo dentro también directo como `VIEWER`, y un archivo suelto como `VIEWER`. */
  const shareWithBruno = (): Promise<void> =>
    app.asActor(ana, async (manager) => {
      const share = { ownerId: ana.id, granteeId: bruno.id };
      await insertShare(manager, { ...share, node: { folderId: tree.folder }, level: 'EDITOR' });
      await insertShare(manager, { ...share, node: { fileId: tree.inFolder }, level: 'VIEWER' });
      await insertShare(manager, { ...share, node: { fileId: tree.alone }, level: 'VIEWER' });
    });

  beforeAll(async () => {
    owner = await connectAsOwner();
    app = await connectAsAppDatabase();
    const ids = await owner.transaction(async (manager) => ({
      ana: await insertAccount(manager),
      bruno: await insertAccount(manager),
      carla: await insertAccount(manager),
    }));
    created.push(...Object.values(ids));
    [ana, bruno, carla] = [ids.ana, ids.bruno, ids.carla].map((id) =>
      createActor(id, Role.CLIENT),
    ) as [Actor, Actor, Actor];
    await seedAnaTree();
    await shareWithBruno();
    brunoFile.id = await app.asActor(
      bruno,
      async (manager) => (await insertFileWithVersion(manager, bruno.id)).fileId,
    );
  });

  afterAll(async () => {
    await app.dataSource.destroy();
    await removeAccounts(owner, created);
    await owner.destroy();
  });

  it('CA-13: Bruno alcanza lo suyo (OWNER), lo directo y el subárbol de la carpeta, con el nivel mayor por nodo', async () => {
    expect(await accessible(bruno)).toEqual(
      byId([
        { nodo_id: brunoFile.id, tipo_nodo: 'archivo', nivel: 'OWNER' },
        { nodo_id: tree.folder, tipo_nodo: 'carpeta', nivel: 'EDITOR' },
        { nodo_id: tree.subfolder, tipo_nodo: 'carpeta', nivel: 'EDITOR' },
        { nodo_id: tree.inFolder, tipo_nodo: 'archivo', nivel: 'EDITOR' },
        { nodo_id: tree.inSubfolder, tipo_nodo: 'archivo', nivel: 'EDITOR' },
        { nodo_id: tree.alone, tipo_nodo: 'archivo', nivel: 'VIEWER' },
      ]),
    );
  });

  it('CA-14: `ownedNodes` de Bruno es solo lo suyo y el de Ana no cambia por compartir', async () => {
    const [brunoOwned, anaOwned] = await Promise.all([
      app.asActor(bruno, (manager) => nodesOf(manager, ownedNodes(bruno))),
      app.asActor(ana, (manager) => nodesOf(manager, ownedNodes(ana))),
    ]);

    expect(idsOf(brunoOwned)).toEqual([brunoFile.id]);
    expect(idsOf(anaOwned).sort()).toEqual(Object.values(tree).sort());
    expect(anaOwned.every((row) => row.nivel === 'OWNER')).toBe(true);
    expect(await accessible(ana)).toEqual(anaOwned);
  });

  it('CA-21: Carla no alcanza nada de Ana y Ana no alcanza nada de Bruno', async () => {
    expect(await accessible(carla)).toEqual([]);
    expect(idsOf(await accessible(ana))).not.toContain(brunoFile.id);
  });

  it('CA-13: un archivo de la carpeta en la papelera deja de verse y vuelve al restaurarlo', async () => {
    await setTrashed(tree.inSubfolder, new Date());
    const trashed = idsOf(await accessible(bruno));
    await setTrashed(tree.inSubfolder, null);

    expect(trashed).not.toContain(tree.inSubfolder);
    expect(idsOf(await accessible(bruno))).toContain(tree.inSubfolder);
  });

  it('CA-17: con Ana suspendida Bruno solo alcanza lo suyo; al reactivarla vuelve igual', async () => {
    const before = await accessible(bruno);

    await setAccountState(ana.id, 'suspendida');
    const suspended = await accessible(bruno);
    await setAccountState(ana.id, 'activa');

    expect(idsOf(suspended)).toEqual([brunoFile.id]);
    expect(await accessible(bruno)).toEqual(before);
  });

  it('CA-21: la RLS da a Bruno solo lo compartido aunque la consulta no filtre; la escritura sigue negada', async () => {
    const [files, folders, renamed] = await app.asActor(bruno, async (manager) => [
      (await manager.query('SELECT id FROM archivo')) as { id: string }[],
      (await manager.query('SELECT id FROM carpeta')) as { id: string }[],
      (await manager.query("UPDATE archivo SET nombre = 'x.pdf' WHERE id = $1", [tree.alone])) as [
        unknown[],
        number,
      ],
    ]);

    expect(files.map((row) => row.id).sort()).toEqual(
      [brunoFile.id, tree.inFolder, tree.inSubfolder, tree.alone].sort(),
    );
    expect(folders.map((row) => row.id).sort()).toEqual([tree.folder, tree.subfolder].sort());
    expect(renamed[1]).toBe(0);
  });

  it('CA-12: la RLS da a Bruno solo la versión vigente de lo compartido y no le deja escribir versiones', async () => {
    const oldVersion = randomUUID();
    await app.asActor(ana, (manager) =>
      manager.query(
        `INSERT INTO version_archivo (id, archivo_id, origen, clave_objeto, tamano_bytes, creado_por, creada_en, numero)
         VALUES ($1, $2, 'carga', $3, 1, $4, now(), 2)`,
        [oldVersion, tree.alone, `u/${ana.id}/${tree.alone}/${oldVersion}`, ana.id],
      ),
    );

    const versions = await app.asActor(
      bruno,
      async (manager) =>
        (await manager.query('SELECT id, archivo_id FROM version_archivo WHERE archivo_id = $1', [
          tree.alone,
        ])) as { id: string }[],
    );
    const deleted = await app.asActor(bruno, (manager) =>
      manager.query('DELETE FROM version_archivo WHERE archivo_id = $1', [tree.alone]),
    );

    expect(versions).toHaveLength(1);
    expect(versions[0]?.id).not.toBe(oldVersion);
    expect((deleted as [unknown[], number])[1]).toBe(0);
  });

  it('R-3: la herencia acota el prefijo de `ruta` con `idx_carpeta_ruta` y la rama compartida corre una vez', async () => {
    const plans = await inRolledBackTransaction(owner, async (runner) => {
      await seedManyFolders(runner, MANY_FOLDERS);
      await runner.query('ANALYZE carpeta');
      const [body] = (await runner.query(
        "SELECT prosrc FROM pg_proc WHERE oid = 'nodos_compartidos()'::regprocedure",
      )) as { prosrc: string }[];
      const live = accessibleNodes(bruno);
      const [outerSql, values] = owner.driver.escapeQueryWithParameters(
        `EXPLAIN SELECT a.id FROM archivo a WHERE a.id IN (SELECT nodo_id FROM (${live.sql}) n)`,
        live.parameters,
        {},
      );
      return {
        inner: planText(await runner.query(`EXPLAIN ${body?.prosrc ?? ''}`)),
        outer: planText(await runner.query(outerSql, values)),
      };
    });
    // No deja al planificador de las demás suites creyendo que `carpeta` tiene miles de filas.
    await refreshNodeStatistics(owner);

    expect(plans.inner).toMatch(
      /idx_carpeta_ruta on carpeta h[^\n]*\n\s*Index Cond: [^\n]*ruta ~>=~ r\.ruta/,
    );
    expect(plans.outer.match(/Function Scan on nodos_compartidos/g)).toHaveLength(1);
  });
});
