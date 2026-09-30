import type { DataSource, EntityManager } from 'typeorm';

import { accessibleNodes } from '../../../src/modules/access';
import { createActor, Role } from '../../../src/shared';
import type { Actor } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import {
  connectAsAppDatabase,
  insertAccount,
  insertFileWithVersion,
  removeAccounts,
} from '../storage/storage-test-db';
import type { AppDatabase } from '../storage/storage-test-db';

interface AccessibleNodeRow {
  nodo_id: string;
  tipo_nodo: string;
  nivel: string;
}

/** Ejecuta el fragmento tal cual lo usan los repositorios: dentro de la transacción del actor, como `nimbo_app`. */
const nodesOf = async (manager: EntityManager, actor: Actor): Promise<AccessibleNodeRow[]> => {
  const fragment = accessibleNodes(actor);
  const [sql, values] = manager.connection.driver.escapeQueryWithParameters(
    `SELECT nodo_id, tipo_nodo, nivel FROM (${fragment.sql}) accesibles ORDER BY nodo_id`,
    fragment.parameters,
    {},
  );
  return (await manager.query(sql, values)) as AccessibleNodeRow[];
};

/** Rama de propiedad de `accessibleNodes` contra el Postgres del arnés (plan 005 D-17, 003 §6.11). */
describe('accessibleNodes en Postgres (CA-13, CA-16)', () => {
  let owner: DataSource;
  let app: AppDatabase;
  let ana: Actor;
  let bruno: Actor;
  let admin: Actor;
  const created: string[] = [];
  const files = { ana: '', anaTrashed: '', bruno: '' };

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
    });
    await app.asActor(bruno, async (manager) => {
      files.bruno = (await insertFileWithVersion(manager, bruno.id)).fileId;
    });
  });

  afterAll(async () => {
    await app.dataSource.destroy();
    await removeAccounts(owner, created);
    await owner.destroy();
  });

  it('CA-13: para `CLIENT` devuelve sus archivos fuera de la papelera como `archivo` con nivel `OWNER`', async () => {
    const rows = await app.asActor(ana, (manager) => nodesOf(manager, ana));

    expect(rows).toEqual([{ nodo_id: files.ana, tipo_nodo: 'archivo', nivel: 'OWNER' }]);
  });

  it('CA-16: el fragmento no devuelve archivos ajenos aunque se ejecute sin RLS (como el dueño)', async () => {
    const rows = await owner.transaction((manager) => nodesOf(manager, ana));

    expect(rows.map((row) => row.nodo_id)).toEqual([files.ana]);
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
