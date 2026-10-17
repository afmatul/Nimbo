import { randomUUID } from 'node:crypto';

import type { DataSource } from 'typeorm';

import { PlanCatalogService } from '../../../src/modules/billing';
import type { NewPlan } from '../../../src/modules/billing';
import { PlanAlreadyDeactivatedError } from '../../../src/modules/billing/domain/errors/plan-already-deactivated.error';
import { PlanInvalidError } from '../../../src/modules/billing/domain/errors/plan-invalid.error';
import { TypeOrmPlanRepository } from '../../../src/modules/billing/infrastructure/persistence/typeorm-plan.repository';
import { createActor, Role, SystemClock } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import { violatedConstraint } from '../identity/identity-rows';
import type { AppDatabase } from '../storage/storage-test-db';
import { connectAsAppDatabase, inRolledBackTransaction } from '../storage/storage-test-db';

const ADMIN = createActor(randomUUID(), Role.ADMIN);
const PERSONAL_ID = '10000000-0000-4000-8000-000000000001';

/** Un nombre que ninguna otra suite usa: el catálogo es compartido por todo el arnés. */
const uniqueName = (): string => `Plan prueba ${randomUUID().slice(0, 8)}`;

const newPlan = (name: string): NewPlan => ({
  name,
  description: null,
  priceCents: 1_000,
  limits: {
    quotaBytes: 1_073_741_824n,
    maxFileBytes: 104_857_600n,
    maxEditors: 0,
    agentQueriesPerMonth: 10,
    retainedVersions: 3,
    trashRetentionDays: 7,
  },
});

/** Catálogo de punta a punta (spec 011 CA-9 a CA-11; 008 CA-1, PD-76) como `nimbo_app`, en la transacción de `run`. */
describe('catálogo de planes con la base real (spec 011 CA-9 a CA-11)', () => {
  let owner: DataSource;
  let app: AppDatabase;
  let catalog: PlanCatalogService;
  const created: string[] = [];

  beforeAll(async () => {
    owner = await connectAsOwner();
    app = await connectAsAppDatabase();
    catalog = new PlanCatalogService(new TypeOrmPlanRepository(app.context), new SystemClock(), {
      error: () => undefined,
    });
  });

  afterAll(async () => {
    await owner?.query('DELETE FROM plan WHERE id = ANY($1)', [created]);
    await app?.dataSource.destroy();
    await owner?.destroy();
  });

  const create = async (name: string): Promise<string> => {
    const plan = await app.runner.run(() => catalog.create(ADMIN, newPlan(name)));
    created.push(plan.id);
    return plan.id;
  };

  it('CA-9, 008 CA-1: un plan nuevo se ofrece en el catálogo público; desactivado, ya no (PD-76)', async () => {
    const id = await create(uniqueName());
    expect((await catalog.list()).map((plan) => plan.id)).toContain(id);

    await app.runner.run(() => catalog.deactivate(ADMIN, id));

    expect((await catalog.list()).map((plan) => plan.id)).not.toContain(id);
  });

  it('CA-11: un nombre repetido (mayúsculas y espacios aparte) es `NAME_TAKEN`', async () => {
    const name = uniqueName();
    await create(name);

    const repeated = app.runner.run(() =>
      catalog.create(ADMIN, newPlan(`  ${name.toUpperCase()} `)),
    );

    await expect(repeated).rejects.toBeInstanceOf(PlanInvalidError);
    await expect(repeated).rejects.toMatchObject({
      fields: [{ field: 'name', reason: 'NAME_TAKEN' }],
    });
  });

  it('CA-10: dos bajas del mismo plan: la segunda es `BILLING_PLAN_ALREADY_DEACTIVATED`', async () => {
    const id = await create(uniqueName());
    await app.runner.run(() => catalog.deactivate(ADMIN, id));

    await expect(app.runner.run(() => catalog.deactivate(ADMIN, id))).rejects.toBeInstanceOf(
      PlanAlreadyDeactivatedError,
    );
  });

  it.each([
    [
      'Personal desactivado',
      `UPDATE plan SET desactivado_en = now() WHERE id = '${PERSONAL_ID}'`,
      'ck_plan_personal_activo',
    ],
    [
      'un máximo por archivo mayor que la cuota',
      `UPDATE plan SET max_archivo_bytes = cuota_bytes + 1 WHERE id = '${PERSONAL_ID}'`,
      'ck_plan_max_archivo',
    ],
  ])('CA-11, RNF-02: la base también rechaza %s', async (_case, sql, constraint) => {
    const violated = await inRolledBackTransaction(owner, (runner) =>
      violatedConstraint(runner.query(sql)),
    );

    expect(violated).toBe(constraint);
  });
});
