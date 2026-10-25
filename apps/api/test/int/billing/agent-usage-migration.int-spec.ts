import type { DataSource } from 'typeorm';

import type { Actor } from '../../../src/shared';
import { createActor, Role } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import type { AppDatabase } from '../storage/storage-test-db';
import { connectAsAppDatabase, insertAccount, removeAccounts } from '../storage/storage-test-db';

import { createFreshDatabase, revertFrom, rlsOf, tableExists } from './billing-test-db';
import type { FreshDatabase } from './billing-test-db';

const USAGE_MIGRATION = 'CrearUsoAgente20261028100000';
const PERIOD_START = new Date('2026-10-01T06:00:00.000Z');

const insertUsage = (database: AppDatabase, actor: Actor, userId: string): Promise<unknown> =>
  database.asActor(actor, (manager) =>
    manager.query(
      'INSERT INTO uso_agente (usuario_id, periodo_inicio, consultas) VALUES ($1, $2, 1)',
      [userId, PERIOD_START],
    ),
  );

const visibleOwners = (database: AppDatabase, actor: Actor): Promise<string[]> =>
  database.asActor(actor, async (manager) =>
    ((await manager.query('SELECT usuario_id FROM uso_agente')) as { usuario_id: string }[]).map(
      (row) => row.usuario_id,
    ),
  );

describe('migración crear-uso-agente: RLS del dueño (spec 020 CA-10, CA-12; RNF-05)', () => {
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
    await insertUsage(app, ana, ana.id);
    await insertUsage(app, bruno, bruno.id);
  });

  afterAll(async () => {
    await app?.dataSource.destroy();
    await removeAccounts(owner, created);
    await owner?.destroy();
  });

  it('RLS forzada con lectura, alta y cambio del cliente, sin borrado ni política interna', async () => {
    await expect(rlsOf(owner, 'uso_agente')).resolves.toEqual({
      forced: true,
      policies: [
        { policyname: 'uso_agente_cliente_alta', cmd: 'INSERT' },
        { policyname: 'uso_agente_cliente_cambio', cmd: 'UPDATE' },
        { policyname: 'uso_agente_cliente_lectura', cmd: 'SELECT' },
      ],
    });
  });

  it('RNF-05: un cliente solo ve su contador', async () => {
    await expect(visibleOwners(app, ana)).resolves.toEqual([ana.id]);
    await expect(visibleOwners(app, bruno)).resolves.toEqual([bruno.id]);
  });

  it('RNF-05: un cliente no crea un contador a nombre de otro (WITH CHECK)', async () => {
    const carla = await insertAccount(owner);
    created.push(carla);

    await expect(insertUsage(app, bruno, carla)).rejects.toThrow(/row-level security/);
  });

  it('menor privilegio: el cliente no borra su contador ni lo pasa a otro periodo o usuario', async () => {
    const asAna = (sql: string, params: unknown[] = []): Promise<unknown> =>
      app.asActor(ana, (manager) => manager.query(sql, params));

    await expect(asAna('DELETE FROM uso_agente WHERE usuario_id = $1', [ana.id])).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      asAna('UPDATE uso_agente SET usuario_id = $2 WHERE usuario_id = $1', [ana.id, bruno.id]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asAna('UPDATE uso_agente SET periodo_inicio = now() WHERE usuario_id = $1', [ana.id]),
    ).rejects.toThrow(/permission denied/);
  });

  it('CHECK: `consultas` no baja de cero', async () => {
    await expect(
      app.asActor(ana, (manager) =>
        manager.query('UPDATE uso_agente SET consultas = -1 WHERE usuario_id = $1', [ana.id]),
      ),
    ).rejects.toThrow(/violates check constraint "ck_uso_agente_consultas"/);
  });

  it.each([Role.ADMIN, Role.SUPPORT, Role.OPERATOR] as const)(
    'RNF-05: %s no lee filas de `uso_agente`',
    async (role) => {
      const internal = createActor(await insertAccount(owner, role), role);
      created.push(internal.id);

      await expect(visibleOwners(app, internal)).resolves.toEqual([]);
    },
  );

  it('RNF-05: `nimbo_app` sin actor no ve filas de `uso_agente`', async () => {
    const [row] = (await app.dataSource.query('SELECT count(*)::int AS n FROM uso_agente')) as {
      n: number;
    }[];

    expect(row?.n).toBe(0);
  });

  it('la cuenta borrada se lleva su contador (ON DELETE CASCADE)', async () => {
    const dana = createActor(await insertAccount(owner), Role.CLIENT);
    await insertUsage(app, dana, dana.id);

    await removeAccounts(owner, [dana.id]);

    const [row] = (await owner.query(
      'SELECT count(*)::int AS n FROM uso_agente WHERE usuario_id = $1',
      [dana.id],
    )) as { n: number }[];
    expect(row?.n).toBe(0);
  });
});

describe('cierre de la migración de `uso_agente`: `revert` y `run` sobre una base vacía (RNF-10)', () => {
  let fresh: FreshDatabase;

  beforeAll(async () => {
    fresh = await createFreshDatabase('nimbo_uso_agente');
  });

  afterAll(async () => {
    await fresh?.drop();
  });

  it('RNF-10: `down` elimina la tabla y sus políticas, y `up` la vuelve a crear', async () => {
    const reverted = await revertFrom(fresh.dataSource, USAGE_MIGRATION);

    expect(reverted[0]).toBe(USAGE_MIGRATION);
    expect(await tableExists(fresh.dataSource, 'uso_agente')).toBe(false);

    const rerun = await fresh.dataSource.runMigrations({ transaction: 'each' });
    expect(rerun.map((migration) => migration.name)).toEqual(reverted);
    expect(await tableExists(fresh.dataSource, 'uso_agente')).toBe(true);
  });
});
