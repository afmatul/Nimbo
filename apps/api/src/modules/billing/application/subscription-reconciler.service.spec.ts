import { createActor, Role } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';
import type { VerifiedClientLister } from '../../identity';

import type { BillingLogger } from './billing-logger';
import type { PersonalSubscriptionService } from './personal-subscription.service';
import {
  SubscriptionReconcileIncompleteError,
  SubscriptionReconcilerService,
} from './subscription-reconciler.service';

const BATCH_SIZE = 2;
const ACCOUNTS = [
  '0b9f4c1e-7a2d-4e5f-8c3b-1d2e3f4a5b6c',
  '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
  '5c6b5a4f-3e2d-4c1b-9a8f-7e6d5c4b3a29',
] as const;

/** Simula `SELECT id … WHERE id > $after ORDER BY id LIMIT $limit` sobre `accounts`. */
const pageOf = (accounts: readonly string[], afterId: string | null, limit: number) =>
  accounts.filter((id) => afterId === null || id > afterId).slice(0, limit);

const setup = (options: { accounts?: readonly string[]; failing?: readonly string[] } = {}) => {
  const accounts = options.accounts ?? ACCOUNTS;
  const pages: string[] = [];
  let insideRun = false;
  const transactions: ITransactionRunner = {
    run: async (work) => {
      insideRun = true;
      try {
        return await work();
      } finally {
        insideRun = false;
      }
    },
    withActor: () => Promise.reject(new Error('la conciliación lista sin actor')),
  };
  const lister = {
    listIds: jest.fn((afterId: string | null, limit: number) => {
      pages.push(`${String(insideRun)}:${String(afterId)}:${String(limit)}`);
      return Promise.resolve(pageOf(accounts, afterId, limit));
    }),
  } as unknown as VerifiedClientLister;
  const subscribe = jest.fn((actor: Actor) =>
    options.failing?.includes(actor.id) === true
      ? Promise.reject(new TypeError(`falló la cuenta ${actor.id}`))
      : Promise.resolve(),
  );
  const personal = { subscribe } as unknown as PersonalSubscriptionService;
  const logger: BillingLogger = { info: jest.fn(), error: jest.fn() };
  const reconciler = new SubscriptionReconcilerService(
    transactions,
    lister,
    personal,
    { intervalMinutes: 60, batchSize: BATCH_SIZE },
    logger,
  );
  return { reconciler, pages, subscribe, logger };
};

describe('SubscriptionReconcilerService (spec 009 CA-2, PD-40)', () => {
  it('CA-2: lista los clientes verificados por páginas de `id` dentro de `ITransactionRunner.run` (sin actor)', async () => {
    const { reconciler, pages } = setup();

    await reconciler.reconcileAll();

    expect(pages).toEqual([`true:null:${String(BATCH_SIZE)}`, `true:${ACCOUNTS[1]}:2`]);
  });

  it('CA-2: da de alta Personal a cada cliente como su dueño (`createActor(id, CLIENT)`)', async () => {
    const { reconciler, subscribe } = setup();

    await reconciler.reconcileAll();

    expect(subscribe.mock.calls).toEqual(ACCOUNTS.map((id) => [createActor(id, Role.CLIENT)]));
  });

  it('CA-2: una página completa pide la siguiente; una vacía cierra la pasada', async () => {
    const { reconciler, pages } = setup({ accounts: ACCOUNTS.slice(0, BATCH_SIZE) });

    await reconciler.reconcileAll();

    expect(pages).toHaveLength(2);
  });

  it('CA-2: registra `billing.reconcile_run` con lo recorrido', async () => {
    const { reconciler, logger } = setup();

    await reconciler.reconcileAll();

    expect(logger.info).toHaveBeenCalledWith({
      event: 'billing.reconcile_run',
      scanned: 3,
      failed: 0,
    });
  });

  it('CA-2: una cuenta con error se registra (solo UUID y nombre del error), no frena las demás y la pasada falla al final', async () => {
    const failing = ACCOUNTS[0];
    const { reconciler, subscribe, logger } = setup({ failing: [failing] });

    await expect(reconciler.reconcileAll()).rejects.toBeInstanceOf(
      SubscriptionReconcileIncompleteError,
    );

    expect(subscribe).toHaveBeenCalledTimes(ACCOUNTS.length);
    expect(logger.error).toHaveBeenCalledWith({
      event: 'billing.reconcile_failed',
      userId: failing,
      errorName: 'TypeError',
    });
    expect(logger.info).toHaveBeenCalledWith({
      event: 'billing.reconcile_run',
      scanned: 3,
      failed: 1,
    });
  });
});
