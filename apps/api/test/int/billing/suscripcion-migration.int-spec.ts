import type { DataSource } from 'typeorm';

import type { Actor } from '../../../src/shared';
import { createActor, Role } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import type { AppDatabase } from '../storage/storage-test-db';
import { connectAsAppDatabase, insertAccount, removeAccounts } from '../storage/storage-test-db';

import { createFreshDatabase, revertFrom, rlsOf, tableExists } from './billing-test-db';
import type { FreshDatabase } from './billing-test-db';

const SUBSCRIPTION_MIGRATION = 'CrearSuscripcion20261014100000';

const insertPersonal = (database: AppDatabase, actor: Actor, userId: string): Promise<unknown> =>
  database.asActor(actor, (manager) =>
    manager.query(
      `INSERT INTO suscripcion (usuario_id, plan_id) SELECT $1, id FROM plan WHERE slug = 'personal'`,
      [userId],
    ),
  );

const visibleOwners = (database: AppDatabase, actor: Actor): Promise<string[]> =>
  database.asActor(actor, async (manager) =>
    ((await manager.query('SELECT usuario_id FROM suscripcion')) as { usuario_id: string }[]).map(
      (row) => row.usuario_id,
    ),
  );

describe('migración crear-suscripcion: RLS del dueño (spec 009 CA-1, RNF-05)', () => {
  let owner: DataSource;
  let app: AppDatabase;
  let ana: Actor;
  let bruno: Actor;
  const created: string[] = [];

  beforeAll(async () => {
    owner = await connectAsOwner();
    app = await connectAsAppDatabase();
    ana = createActor(await insertAccount(owner), Role.CLIENT);
    bruno = createActor(await insertAccount(owner), Role.CLIENT);
    created.push(ana.id, bruno.id);
    await insertPersonal(app, ana, ana.id);
    await insertPersonal(app, bruno, bruno.id);
  });

  afterAll(async () => {
    await app?.dataSource.destroy();
    await removeAccounts(owner, created);
    await owner?.destroy();
  });

  it('CA-1, T-03, PR #62 #10: RLS forzada con lectura, alta y cambio del cliente (sin borrado) y la lectura de administración', async () => {
    await expect(rlsOf(owner, 'suscripcion')).resolves.toEqual({
      forced: true,
      policies: [
        { policyname: 'suscripcion_administracion', cmd: 'SELECT' },
        // 011b (ADR-0035): solo la usan las funciones de ajuste del Administrador.
        { policyname: 'suscripcion_ajuste_administracion', cmd: 'UPDATE' },
        { policyname: 'suscripcion_cliente_alta', cmd: 'INSERT' },
        { policyname: 'suscripcion_cliente_cambio', cmd: 'UPDATE' },
        { policyname: 'suscripcion_cliente_lectura', cmd: 'SELECT' },
        { policyname: 'suscripcion_mantenimiento', cmd: 'SELECT' },
      ],
    });
  });

  it('PR #62 #10: el cliente no puede borrar su suscripción ni pasarla a otro usuario', async () => {
    const asAna = (sql: string, params: unknown[] = []): Promise<unknown> =>
      app.asActor(ana, (manager) => manager.query(sql, params));

    await expect(asAna('DELETE FROM suscripcion WHERE usuario_id = $1', [ana.id])).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      asAna('UPDATE suscripcion SET usuario_id = $2 WHERE usuario_id = $1', [ana.id, bruno.id]),
    ).rejects.toThrow(/permission denied/);
    await expect(visibleOwners(app, ana)).resolves.toEqual([ana.id]);
  });

  it('RNF-05: un cliente solo ve su suscripción', async () => {
    await expect(visibleOwners(app, ana)).resolves.toEqual([ana.id]);
    await expect(visibleOwners(app, bruno)).resolves.toEqual([bruno.id]);
  });

  it('RNF-05: un cliente no puede crear una suscripción a nombre de otro (WITH CHECK)', async () => {
    const carla = await insertAccount(owner);
    created.push(carla);

    await expect(insertPersonal(app, bruno, carla)).rejects.toThrow(/row-level security/);
  });

  it.each([Role.ADMIN, Role.SUPPORT, Role.OPERATOR] as const)(
    'RNF-05: %s no lee filas de `suscripcion`',
    async (role) => {
      const internal = createActor(await insertAccount(owner, role), role);
      created.push(internal.id);

      await expect(visibleOwners(app, internal)).resolves.toEqual([]);
    },
  );

  it('RNF-05: `nimbo_app` sin actor no ve filas de `suscripcion`', async () => {
    const [row] = (await app.dataSource.query('SELECT count(*)::int AS n FROM suscripcion')) as {
      n: number;
    }[];

    expect(row?.n).toBe(0);
  });
});

describe('cierre de la migración de suscripción: `revert` y `run` sobre una base vacía (RNF-10)', () => {
  let fresh: FreshDatabase;

  beforeAll(async () => {
    fresh = await createFreshDatabase('nimbo_suscripcion');
  });

  afterAll(async () => {
    await fresh?.drop();
  });

  it('RNF-10: `down` elimina la tabla y su política, y `up` la vuelve a crear', async () => {
    const reverted = await revertFrom(fresh.dataSource, SUBSCRIPTION_MIGRATION);

    expect(reverted[0]).toBe(SUBSCRIPTION_MIGRATION);
    expect(await tableExists(fresh.dataSource, 'suscripcion')).toBe(false);

    const rerun = await fresh.dataSource.runMigrations({ transaction: 'each' });
    expect(rerun.map((migration) => migration.name)).toEqual(reverted);
    expect(await tableExists(fresh.dataSource, 'suscripcion')).toBe(true);
  });
});
