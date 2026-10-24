import { randomUUID } from 'node:crypto';

import { createActor, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import type { Plan, PlanClientCount } from '../../billing';
import type { AccountStatistics } from '../../identity';

import { MetricsService } from './metrics.service';

const RETIRED_AT = new Date('2026-10-01T09:00:00.000Z');

const STATISTICS: AccountStatistics = {
  total: 12,
  clients: 9,
  internal: 3,
  active: 10,
  suspended: 2,
  usedBytesTotal: 3_221_225_472n,
};

/** Solo lo que el tablero lee de un plan del catálogo. */
const aPlan = (name: string, deactivatedAt: Date | null = null): Plan =>
  ({ id: randomUUID(), name, deactivatedAt }) as Plan;

const setup = (plans: readonly Plan[], counts: readonly PlanClientCount[]) => {
  const reads: Actor[] = [];
  const internal = {
    read: <T>(actor: Actor, work: () => Promise<T>): Promise<T> => {
      reads.push(actor);
      return work();
    },
  };
  const directory = { statistics: jest.fn(() => Promise.resolve(STATISTICS)) };
  const subscriptions = { clientCountsByPlan: jest.fn(() => Promise.resolve(counts)) };
  const catalog = { listAll: jest.fn(() => Promise.resolve([...plans])) };
  const service = new MetricsService(internal, directory, subscriptions, catalog);
  const actor = createActor(randomUUID(), Role.OPERATOR);
  return { reads, directory, subscriptions, catalog, service, actor };
};

describe('MetricsService (011 CA-12)', () => {
  it('CA-12: lee en `InternalActionService.read` con el mismo actor en las tres fachadas y devuelve los totales de `identity` tal cual', async () => {
    const { reads, directory, subscriptions, catalog, service, actor } = setup([], []);

    const metrics = await service.read(actor);

    expect(reads).toEqual([actor]);
    expect(metrics.accounts).toEqual(STATISTICS);
    expect(directory.statistics).toHaveBeenCalledWith(actor);
    expect(subscriptions.clientCountsByPlan).toHaveBeenCalledWith(actor);
    expect(catalog.listAll).toHaveBeenCalledWith(actor);
  });

  it('CA-12: todos los activos (0 si no tienen clientes) y los desactivados solo si aún tienen clientes, en el orden del catálogo', async () => {
    const team = aPlan('Equipo');
    const emptyActive = aPlan('Pro');
    const retiredWithClients = aPlan('Viejo', RETIRED_AT);
    const retiredEmpty = aPlan('Olvidado', RETIRED_AT);
    const { service, actor } = setup(
      [team, emptyActive, retiredWithClients, retiredEmpty],
      [
        { planId: retiredWithClients.id, clientCount: 2 },
        { planId: team.id, clientCount: 5 },
      ],
    );

    const { byPlan } = await service.read(actor);

    expect(byPlan).toEqual([
      { planId: team.id, name: 'Equipo', deactivatedAt: null, clientCount: 5 },
      { planId: emptyActive.id, name: 'Pro', deactivatedAt: null, clientCount: 0 },
      { planId: retiredWithClients.id, name: 'Viejo', deactivatedAt: RETIRED_AT, clientCount: 2 },
    ]);
  });
});
