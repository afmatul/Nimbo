import { randomUUID } from 'node:crypto';

import { createActor, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import type { AuditRecord } from '../../audit';
import type { NewPlan, Plan, PlanClientCount } from '../../billing';

import { CatalogAdminService } from './catalog-admin.service';
import type { InternalAction } from './internal-action.service';

const RETIRED_AT = new Date('2026-10-01T09:00:00.000Z');

/** Solo lo que el servicio lee de un plan del catálogo; el resto lo mapea la respuesta. */
const aPlan = (name: string, deactivatedAt: Date | null = null): Plan =>
  ({ id: randomUUID(), name, deactivatedAt }) as Plan;

const NEW_PLAN: NewPlan = {
  name: 'Pro Anual',
  description: null,
  priceCents: 45_000,
  limits: {
    quotaBytes: 107_374_182_400n,
    maxFileBytes: 524_288_000n,
    maxEditors: 3,
    agentQueriesPerMonth: 500,
    retainedVersions: 30,
    trashRetentionDays: 30,
  },
};

interface SetupOptions {
  readonly plans?: readonly Plan[];
  readonly counts?: readonly PlanClientCount[];
  /** La «transacción» de `run` falla al confirmar (p. ej. el evento no se guarda). */
  readonly commitFails?: boolean;
}

/** `InternalActionService` en memoria: anota la acción, el evento y el `commit`; sus garantías las prueba su spec. */
const setup = (options: SetupOptions = {}) => {
  const timeline: string[] = [];
  const recorded: AuditRecord[] = [];
  const logs: Record<string, unknown>[] = [];
  const internal = {
    read: <T>(_actor: Actor, work: () => Promise<T>): Promise<T> => work(),
    run: async <T>(_actor: Actor, action: InternalAction<T>): Promise<T> => {
      timeline.push(`run:locks=${String(action.locksAdminRoster)}`);
      const result = await action.work();
      recorded.push(action.event(result));
      if (options.commitFails === true) throw new Error('no se pudo confirmar la transacción');
      timeline.push('commit');
      return result;
    },
  };
  const created = aPlan('Pro Anual');
  const catalog = {
    listAll: jest.fn(() => Promise.resolve([...(options.plans ?? [])])),
    create: jest.fn(() => Promise.resolve(created)),
    deactivate: jest.fn((_actor: Actor, id: string) =>
      Promise.resolve({ ...aPlan('Viejo', RETIRED_AT), id } as Plan),
    ),
  };
  const subscriptions = {
    clientCountsByPlan: jest.fn(() => Promise.resolve(options.counts ?? [])),
  };
  const logger = {
    info: (payload: Record<string, unknown>): void => {
      timeline.push(String(payload.event));
      logs.push(payload);
    },
  };
  const service = new CatalogAdminService(internal, catalog, subscriptions, logger);
  const actor = createActor(randomUUID(), Role.ADMIN);
  return { timeline, recorded, logs, catalog, subscriptions, created, service, actor };
};

describe('CatalogAdminService (011 CA-8 a CA-11)', () => {
  it('CA-8: todos los planes del catálogo, en su orden, con su conteo de clientes (0 si no tienen)', async () => {
    const team = aPlan('Equipo');
    const retired = aPlan('Viejo', RETIRED_AT);
    const { service, catalog, subscriptions, actor } = setup({
      plans: [team, retired],
      counts: [{ planId: retired.id, clientCount: 2 }],
    });

    const entries = await service.list(actor);

    expect(entries).toEqual([
      { plan: team, clientCount: 0 },
      { plan: retired, clientCount: 2 },
    ]);
    expect(catalog.listAll).toHaveBeenCalledWith(actor);
    expect(subscriptions.clientCountsByPlan).toHaveBeenCalledWith(actor);
  });

  it('CA-9: crea sin candado del padrón, audita sin afectado y anota la bitácora después del commit', async () => {
    const { service, timeline, recorded, logs, catalog, created, actor } = setup();

    const entry = await service.create(actor, NEW_PLAN);

    expect(catalog.create).toHaveBeenCalledWith(actor, NEW_PLAN);
    expect(entry).toEqual({ plan: created, clientCount: 0 });
    expect(timeline).toEqual(['run:locks=false', 'commit', 'backoffice.plan.created']);
    expect(recorded).toEqual([
      { action: 'plan.created', actor, targetUserId: null, resourceId: created.id },
    ]);
    expect(logs).toEqual([
      { event: 'backoffice.plan.created', actorId: actor.id, planId: created.id },
    ]);
  });

  it('CA-10: desactiva, devuelve el plan con su conteo de clientes y lo audita', async () => {
    const id = randomUUID();
    const { service, timeline, recorded, logs, actor } = setup({
      counts: [{ planId: id, clientCount: 3 }],
    });

    const entry = await service.deactivate(actor, id);

    expect(entry).toMatchObject({ plan: { id, deactivatedAt: RETIRED_AT }, clientCount: 3 });
    expect(timeline).toEqual(['run:locks=false', 'commit', 'backoffice.plan.deactivated']);
    expect(recorded).toEqual([
      { action: 'plan.deactivated', actor, targetUserId: null, resourceId: id },
    ]);
    expect(logs).toEqual([{ event: 'backoffice.plan.deactivated', actorId: actor.id, planId: id }]);
  });

  it('si la transacción se revierte, no anota la bitácora de éxito', async () => {
    const { service, logs, actor } = setup({ commitFails: true });

    await expect(service.create(actor, NEW_PLAN)).rejects.toThrow('no se pudo confirmar');
    await expect(service.deactivate(actor, randomUUID())).rejects.toThrow('no se pudo confirmar');
    expect(logs).toEqual([]);
  });
});
