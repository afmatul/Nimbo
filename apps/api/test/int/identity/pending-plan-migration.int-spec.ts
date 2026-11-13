import { createFreshDatabase, revertFrom } from '../billing/billing-test-db';
import type { FreshDatabase } from '../billing/billing-test-db';
import { columnsOf } from '../storage/storage-test-db';

const PENDING_PLAN_MIGRATION = 'AgregarPlanPendienteAUsuario20261113100000';

/** Registro con plan: `usuario.plan_pendiente_slug` (DF-98), reversible en una base nueva. */
describe('migración agregar-plan-pendiente-a-usuario', () => {
  let fresh: FreshDatabase;

  beforeAll(async () => {
    fresh = await createFreshDatabase('nimbo_plan_pendiente');
  });

  afterAll(async () => {
    await fresh?.drop();
  });

  it('agrega `plan_pendiente_slug varchar(50) NULL`; run → revert → run la quita y la repone', async () => {
    const column = async () =>
      (await columnsOf(fresh.dataSource, 'usuario'))['plan_pendiente_slug'];
    const expected = { type: 'character varying', nullable: true, default: null };
    await expect(column()).resolves.toEqual(expected);

    const reverted = await revertFrom(fresh.dataSource, PENDING_PLAN_MIGRATION);
    await expect(column()).resolves.toBeUndefined();

    await fresh.dataSource.runMigrations({ transaction: 'each' });
    expect(reverted[0]).toBe(PENDING_PLAN_MIGRATION);
    await expect(column()).resolves.toEqual(expected);
  });
});
