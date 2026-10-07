import type { DataSource, EntityManager } from 'typeorm';

import { accessibleNodes, ownedTrashedNodes } from '../../../src/modules/access';
import type { AccessibleNodesFragment } from '../../../src/modules/access';
import { createActor, Role } from '../../../src/shared';
import type { Actor } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import {
  connectAsAppDatabase,
  insertAccount,
  insertFileWithVersion,
  insertFolder,
  removeAccounts,
} from '../storage/storage-test-db';
import type { AppDatabase } from '../storage/storage-test-db';

interface AccessibleNodeRow {
  nodo_id: string;
  tipo_nodo: string;
  nivel: string;
}

/** Ejecuta el fragmento tal cual lo usan los repositorios: dentro de la transacción del actor, como `nimbo_app`. */
const nodesOf = async (
  manager: EntityManager,
  actor: Actor,
  fragmentOf: (actor: Actor) => AccessibleNodesFragment = accessibleNodes,
): Promise<AccessibleNodeRow[]> => {
  const fragment = fragmentOf(actor);
  const [sql, values] = manager.connection.driver.escapeQueryWithParameters(
    `SELECT nodo_id, tipo_nodo, nivel FROM (${fragment.sql}) accesibles ORDER BY nodo_id`,
    fragment.parameters,
    {},
  );
  return (await manager.query(sql, values)) as AccessibleNodeRow[];
};

/** Orden estable para comparar: el `ORDER BY` de `uuid` en Postgres no es el de las cadenas en JS. */
const byId = (rows: readonly AccessibleNodeRow[]): AccessibleNodeRow[] =>
  [...rows].sort((left, right) => left.nodo_id.localeCompare(right.nodo_id));

/** Rama de propiedad de `accessibleNodes` y `ownedTrashedNodes` contra el Postgres del arnés (005 D-17, 006 §1). */
describe('accessibleNodes en Postgres (CA-13, CA-16; 006 CA-11, CA-22)', () => {
  let owner: DataSource;
  let app: AppDatabase;
  let ana: Actor;
  let bruno: Actor;
  let admin: Actor;
  const created: string[] = [];
  const files = { ana: '', anaTrashed: '', bruno: '' };
  const folders = { ana: '', anaTrashed: '', anaDragged: '', bruno: '' };
  let anaDraggedFile = '';

  beforeAll(async () => {
    owner = await connectAsOwner();
    app = await connectAsAppDatabase();
    const accounts = await owner.transaction(async (manager) => ({
      ana: await insertAccount(manager),
      bruno: await insertAccount(manager),
      admin: await insertAccount(manager, Role.ADMIN),
    }));
    created.push(...Object.values(accounts));
    ana = createActor(accounts.ana, Role.CLIENT);
    bruno = createActor(accounts.bruno, Role.CLIENT);
    admin = createActor(accounts.admin, Role.ADMIN);
    await app.asActor(ana, async (manager) => {
      files.ana = (await insertFileWithVersion(manager, ana.id)).fileId;
      files.anaTrashed = (
        await insertFileWithVersion(manager, ana.id, { deletedAt: new Date() })
      ).fileId;
      folders.ana = (await insertFolder(manager, ana.id)).id;
      const deletedAt = new Date();
      const trashed = await insertFolder(manager, ana.id, { deletedAt });
      folders.anaTrashed = trashed.id;
      const dragged = { deletedAt, trashedWithFolderId: trashed.id };
      folders.anaDragged = (
        await insertFolder(manager, ana.id, { parent: trashed, ...dragged })
      ).id;
      anaDraggedFile = (
        await insertFileWithVersion(manager, ana.id, { folderId: folders.anaDragged, ...dragged })
      ).fileId;
    });
    await app.asActor(bruno, async (manager) => {
      files.bruno = (await insertFileWithVersion(manager, bruno.id)).fileId;
      folders.bruno = (await insertFolder(manager, bruno.id, { deletedAt: new Date() })).id;
    });
  });

  afterAll(async () => {
    await app.dataSource.destroy();
    await removeAccounts(owner, created);
    await owner.destroy();
  });

  it('CA-22 (006): para `CLIENT` devuelve sus archivos y carpetas fuera de la papelera con nivel `OWNER`', async () => {
    const rows = await app.asActor(ana, (manager) => nodesOf(manager, ana));

    expect(byId(rows)).toEqual(
      byId([
        { nodo_id: files.ana, tipo_nodo: 'archivo', nivel: 'OWNER' },
        { nodo_id: folders.ana, tipo_nodo: 'carpeta', nivel: 'OWNER' },
      ]),
    );
  });

  it('CA-11 (006): `ownedTrashedNodes` devuelve solo las raíces de su papelera, sin lo arrastrado ni lo ajeno', async () => {
    const rows = await app.asActor(ana, (manager) => nodesOf(manager, ana, ownedTrashedNodes));

    expect(byId(rows)).toEqual(
      byId([
        { nodo_id: files.anaTrashed, tipo_nodo: 'archivo', nivel: 'OWNER' },
        { nodo_id: folders.anaTrashed, tipo_nodo: 'carpeta', nivel: 'OWNER' },
      ]),
    );
    expect(rows.map((row) => row.nodo_id)).not.toContain(anaDraggedFile);
  });

  it('CA-22 (006): `ownedTrashedNodes` no devuelve la papelera ajena aunque se ejecute sin RLS', async () => {
    const rows = await owner.transaction((manager) => nodesOf(manager, ana, ownedTrashedNodes));

    expect(rows.map((row) => row.nodo_id)).not.toContain(folders.bruno);
  });

  it('CA-22 (006): un rol interno recibe la papelera vacía', async () => {
    const rows = await app.asActor(admin, (manager) => nodesOf(manager, admin, ownedTrashedNodes));

    expect(rows).toEqual([]);
  });

  it('CA-16: el fragmento no devuelve archivos ajenos aunque se ejecute sin RLS (como el dueño)', async () => {
    const rows = await owner.transaction((manager) => nodesOf(manager, ana));

    expect(rows.map((row) => row.nodo_id).sort()).toEqual([files.ana, folders.ana].sort());
    expect(rows.map((row) => row.nodo_id)).not.toContain(files.bruno);
  });

  it('CA-16: un rol interno recibe el conjunto vacío aunque la RLS le deje leer metadatos', async () => {
    const [rows, visibleFiles] = await app.asActor(admin, async (manager) => [
      await nodesOf(manager, admin),
      (await manager.query('SELECT count(*)::int AS n FROM archivo')) as { n: number }[],
    ]);

    expect(rows).toEqual([]);
    expect(visibleFiles[0]?.n).toBeGreaterThan(0);
  });
});
