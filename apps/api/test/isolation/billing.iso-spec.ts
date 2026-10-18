import { randomUUID } from 'node:crypto';

import { billingHistoryResponseSchema, TEST_CARDS } from '@nimbo/contracts';
import type { BillingHistoryResponse } from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';
import { DataSource } from 'typeorm';

import { BillingHttpModule } from '../../src/modules/billing';
import { StorageModule } from '../../src/modules/storage';
import { PlanLimitsBindingModule } from '../../src/plan-limits-binding.module';
import {
  buildDataSourceOptions,
  createActor,
  I_TRANSACTION_RUNNER,
  Role,
  TransactionContext,
} from '../../src/shared';
import type { ITransactionRunner } from '../../src/shared';
import { buildTestEnv, createTestApp } from '../int/setup/test-app';
import type { TestApp } from '../int/setup/test-app';
import { connectAsOwner, requiredEnv } from '../support/database-urls';
import { clearMailQueue } from '../support/mail-queue';

import { createIsolationWorld } from './setup/isolation-world';
import type { InternalRole, IsolationWorld, WorldAccount } from './setup/isolation-world';

const INTERNAL_ROLES: readonly InternalRole[] = [Role.ADMIN, Role.SUPPORT, Role.OPERATOR];

/** Lo que un cliente distingue de una respuesta: todo menos el `correlationId`. */
const comparable = (response: Response) => {
  const { correlationId: _ignored, ...body } = response.body as Record<string, unknown>;
  return { status: response.status, body };
};

/**
 * Aislamiento del historial y las facturas (spec 009 CA-7, CA-8; RNF-05) como `nimbo_app` con tokens reales: cada
 * cliente ve solo sus pagos, la factura ajena responde como la inexistente, los roles internos no llegan a las rutas y
 * RLS no les devuelve filas de `suscripcion`, `transaccion` ni `factura` aunque la consulta no filtre.
 */
describe('aislamiento de pagos y facturas (spec 009 CA-7, CA-8)', () => {
  let world: IsolationWorld;
  let testApp: TestApp;
  let a: WorldAccount;
  let b: WorldAccount;
  let historyA: BillingHistoryResponse;

  const asAccount = (account: WorldAccount) => ({
    get: (path: string) =>
      request(testApp.app.getHttpServer())
        .get(`/api/v1/billing/${path}`)
        .set({ Authorization: `Bearer ${world.tokenFor(account)}` }),
    subscribe: (number: string) =>
      request(testApp.app.getHttpServer())
        .post('/api/v1/billing/subscribe')
        .set({ Authorization: `Bearer ${world.tokenFor(account)}` })
        .send({
          planSlug: 'equipo',
          card: { number, expMonth: 12, expYear: 2030, cvc: '123' },
          nit: 'CF',
        }),
  });
  const historyOf = async (account: WorldAccount): Promise<BillingHistoryResponse> =>
    billingHistoryResponseSchema.parse((await asAccount(account).get('history')).body);
  const invoiceIdOf = (history: BillingHistoryResponse): string => {
    const id = history.payments.find((payment) => payment.invoice !== null)?.invoice?.id;
    if (id === undefined) throw new Error('sin factura');
    return id;
  };

  beforeAll(async () => {
    world = await createIsolationWorld();
    const composition = world.appComposition();
    const env = buildTestEnv({ ...composition.env, DATABASE_URL: requiredEnv('DATABASE_URL') });
    const storage = StorageModule.forRoot(env);
    testApp = await createTestApp({
      validatedEnv: env,
      accessTokenStrategy: composition.accessTokenStrategy,
      modules: [
        ...composition.modules,
        PlanLimitsBindingModule,
        storage,
        BillingHttpModule.forRoot(env, storage),
      ],
    });
    [a, b] = world.clients;
    for (const account of [a, b]) {
      await asAccount(account).subscribe(TEST_CARDS.rejected);
      await asAccount(account).subscribe(TEST_CARDS.approved);
    }
    historyA = await historyOf(a);
  });

  afterAll(async () => {
    await testApp?.close();
    await clearMailQueue();
    const owner = await connectAsOwner();
    const ids = world?.clients.map((account) => account.id) ?? [];
    await owner.query('DELETE FROM factura WHERE usuario_id = ANY($1)', [ids]);
    await owner.query('DELETE FROM transaccion WHERE usuario_id = ANY($1)', [ids]);
    await owner.destroy();
    await world?.close();
  });

  it('CA-7: cada cliente ve solo sus dos pagos; ninguna referencia ni factura del otro', async () => {
    const historyB = await historyOf(b);
    const idsOf = (history: BillingHistoryResponse) =>
      history.payments.map((payment) => payment.id);

    expect(historyA.payments).toHaveLength(2);
    expect(historyB.payments).toHaveLength(2);
    expect(idsOf(historyB).filter((id) => idsOf(historyA).includes(id))).toEqual([]);
    expect(JSON.stringify(historyB)).not.toContain(invoiceIdOf(historyA));
  });

  it('CA-8: B pide la factura de A y recibe el mismo 404 que una inexistente', async () => {
    const foreign = await asAccount(b).get(`invoices/${invoiceIdOf(historyA)}/download`);
    const missing = await asAccount(b).get(`invoices/${randomUUID()}/download`);

    expect(foreign.status).toBe(404);
    expect(foreign.body).toMatchObject({ code: 'BILLING_INVOICE_NOT_FOUND' });
    expect(comparable(foreign)).toEqual(comparable(missing));
  });

  it.each(INTERNAL_ROLES)(
    'RNF-05: un %s no llega al historial ni a la descarga (403)',
    async (role) => {
      const internal = asAccount(world.internals[role]);

      const history = await internal.get('history');
      const download = await internal.get(`invoices/${invoiceIdOf(historyA)}/download`);

      expect([history.status, download.status]).toEqual([403, 403]);
    },
  );

  it.each(INTERNAL_ROLES)(
    'spec §5: con actor %s, RLS no devuelve filas de `suscripcion`, `transaccion` ni `factura`',
    async (role) => {
      const runner = testApp.app.get<ITransactionRunner>(I_TRANSACTION_RUNNER);
      const context = testApp.app.get(TransactionContext);
      const actor = createActor(world.internals[role].id, role);

      const counts = await runner.withActor(actor, async () => {
        const manager = context.requireActorScope(actor);
        const count = async (table: string): Promise<number> => {
          const [row] = (await manager.query(`SELECT count(*)::int AS total FROM ${table}`)) as {
            total: number;
          }[];
          return row?.total ?? -1;
        };
        return [await count('suscripcion'), await count('transaccion'), await count('factura')];
      });

      expect(counts).toEqual([0, 0, 0]);
    },
  );

  it('RNF-05: `nimbo_app` sin actor no ve pagos ni facturas de los clientes', async () => {
    const bare = await new DataSource(
      buildDataSourceOptions({ DATABASE_URL: requiredEnv('DATABASE_URL') }),
    ).initialize();
    try {
      const ids = world.clients.map((account) => account.id);
      const [row] = (await bare.query(
        `SELECT (SELECT count(*) FROM transaccion WHERE usuario_id = ANY($1))::int
              + (SELECT count(*) FROM factura WHERE usuario_id = ANY($1))::int AS total`,
        [ids],
      )) as { total: number }[];

      expect(row?.total).toBe(0);
    } finally {
      await bare.destroy();
    }
  });
});
