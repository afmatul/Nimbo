import type { DataSource } from 'typeorm';

import { BillingWorkerModule } from '../../../src/modules/billing';
import { SubscriptionReconcilerService } from '../../../src/modules/billing/application/subscription-reconciler.service';
import { connectAsOwner } from '../../support/database-urls';
import { buildTestEnv, createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';
import { insertAccount, removeAccounts } from '../storage/storage-test-db';

/** Una hora: el programa repetible no corre por su cuenta durante la suite; cada pasada la pide la prueba. */
const RECONCILE_INTERVAL_MINUTES = '60';
/** Páginas chicas: la pasada recorre varias páginas aunque la base tenga pocas cuentas. */
const RECONCILE_BATCH_SIZE = '2';

/**
 * Conciliación de suscripciones (spec 009 CA-2) con `BillingWorkerModule` contra Postgres real, como `nimbo_app`: la
 * lista sale de `identity` sin actor y cada alta corre con el actor del dueño bajo RLS forzado.
 */
describe('conciliación de suscripciones (spec 009 CA-2)', () => {
  let worker: TestApp;
  let owner: DataSource;
  let reconciler: SubscriptionReconcilerService;
  const created: string[] = [];

  beforeAll(async () => {
    const env = buildTestEnv(
      {
        SUBSCRIPTION_RECONCILE_INTERVAL_MINUTES: RECONCILE_INTERVAL_MINUTES,
        SUBSCRIPTION_RECONCILE_BATCH_SIZE: RECONCILE_BATCH_SIZE,
      },
      { withWorkerEnv: true },
    );
    worker = await createTestApp({
      validatedEnv: env,
      modules: [BillingWorkerModule.forRoot(env)],
      prefix: '',
    });
    reconciler = worker.app.get(SubscriptionReconcilerService);
    owner = await connectAsOwner();
  });

  afterAll(async () => {
    await removeAccounts(owner, created);
    await owner?.destroy();
    await worker?.close();
  });

  const account = async (verified: boolean): Promise<string> => {
    const id = await insertAccount(owner);
    created.push(id);
    if (!verified)
      await owner.query('UPDATE usuario SET correo_verificado = false WHERE id = $1', [id]);
    return id;
  };

  const plansOf = async (userId: string): Promise<string[]> =>
    (
      (await owner.query(
        `SELECT p.slug FROM suscripcion s JOIN plan p ON p.id = s.plan_id WHERE s.usuario_id = $1`,
        [userId],
      )) as { slug: string }[]
    ).map((row) => row.slug);

  it('CA-2: un cliente verificado sin suscripción recibe Personal; uno sin verificar, no', async () => {
    const verified = await account(true);
    const unverified = await account(false);

    await reconciler.reconcileAll();

    expect(await plansOf(verified)).toEqual(['personal']);
    expect(await plansOf(unverified)).toEqual([]);
  });

  it('CA-2: repetir la conciliación no duplica ni cambia una suscripción existente', async () => {
    const client = await account(true);
    await reconciler.reconcileAll();
    await owner.query(
      `UPDATE suscripcion SET plan_id = (SELECT id FROM plan WHERE slug = 'pro') WHERE usuario_id = $1`,
      [client],
    );

    await reconciler.reconcileAll();

    expect(await plansOf(client)).toEqual(['pro']);
  });
});
