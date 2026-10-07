import { createActor, Role } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';
import { SpaceBreakdown } from '../domain/space-breakdown';

import type { IQuotaRepository } from './ports/i-quota.repository.port';
import type { SpaceMeasurer } from './space-measurer';
import type { StorageLogger } from './storage-logger';
import { UsageReconcileIncompleteError, UsageReconciler } from './usage-reconciler';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const FILE_NAME = 'informe-confidencial.docx';

const setup = (recordedBytes: bigint, measuredLiveBytes: bigint, trashBytes = 0n) => {
  const journal: string[] = [];
  let actorInScope: Actor | null = null;
  const transactions: ITransactionRunner = {
    run: (work) => work(),
    withActor: async (actor, work) => {
      journal.push(`withActor:${actor.id}`);
      actorInScope = actor;
      try {
        return await work();
      } finally {
        actorInScope = null;
        journal.push('commit');
      }
    },
  };
  const quotas = {
    lockUsage: jest.fn((actor: Actor) => {
      journal.push(`lock:${String(actorInScope === actor)}`);
      return Promise.resolve(recordedBytes);
    }),
    addUsedBytes: jest.fn((_actor: Actor, delta: bigint) => {
      journal.push(`add:${delta.toString()}`);
      return Promise.resolve();
    }),
  };
  const measurer = {
    measure: jest.fn((actor: Actor) => {
      journal.push(`measure:${String(actorInScope === actor)}`);
      return Promise.resolve(
        SpaceBreakdown.fromBytesByKind(new Map([['docx', measuredLiveBytes]]), trashBytes),
      );
    }),
  };
  const info = jest.fn((payload: Record<string, unknown>) => {
    journal.push(`log:${String(payload['event'])}`);
  });
  const logger: StorageLogger = { info, warn: jest.fn(), error: jest.fn() };
  const reconciler = new UsageReconciler(
    transactions,
    quotas as unknown as IQuotaRepository,
    measurer as unknown as SpaceMeasurer,
    logger,
  );
  return { reconciler, journal, quotas, info };
};

describe('UsageReconciler (spec 007 CA-13, CA-14; plan D-11)', () => {
  it('CA-13: como el dueño, bloquea primero, mide y deja `espacio_usado` igual a lo medido (deriva hacia arriba)', async () => {
    const { reconciler, journal } = setup(1000n, 1200n, 300n);

    await reconciler.reconcile(ANA);

    expect(journal).toEqual([
      `withActor:${ANA.id}`,
      'lock:true',
      'measure:true',
      'add:500',
      'commit',
      'log:quota.reconciled',
    ]);
  });

  it('CA-13: una deriva hacia abajo resta la diferencia', async () => {
    const { reconciler, quotas } = setup(5000n, 1500n);

    await reconciler.reconcile(ANA);

    expect(quotas.addUsedBytes).toHaveBeenCalledWith(ANA, -3500n);
  });

  it('CA-13, RNF-17: el evento técnico lleva solo el UUID y la diferencia, sin nombres de archivos', async () => {
    const { reconciler, info } = setup(100n, 40n);

    await reconciler.reconcile(ANA);

    expect(info).toHaveBeenCalledWith({
      event: 'quota.reconciled',
      userId: ANA.id,
      diffBytes: -60,
    });
    expect(JSON.stringify(info.mock.calls)).not.toContain(FILE_NAME);
  });

  it('CA-14: una cuenta coherente no cambia ni registra nada (idempotente)', async () => {
    const { reconciler, quotas, info } = setup(700n, 500n, 200n);

    await reconciler.reconcile(ANA);

    expect(quotas.addUsedBytes).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it('CA-15: el error de una pasada incompleta dice cuántas cuentas faltan, sin datos de ellas', () => {
    const error = new UsageReconcileIncompleteError(2);

    expect(error.name).toBe('UsageReconcileIncompleteError');
    expect(error.failed).toBe(2);
    expect(error.message).toContain('2');
  });
});
