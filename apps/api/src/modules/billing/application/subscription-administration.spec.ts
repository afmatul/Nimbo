import { createActor, Role } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';

import type { ISubscriptionAdministrationReader } from './ports/i-subscription-administration.reader.port';
import { SubscriptionAdministration } from './subscription-administration';

const ADMIN: Actor = createActor('99999999-9999-4999-8999-999999999999', Role.ADMIN);
const ANA = '11111111-1111-4111-8111-111111111111';
const TEAM_ID = '10000000-0000-4000-8000-000000000003';

const setup = () => {
  const scopes: string[] = [];
  const transactions: ITransactionRunner = {
    run: () => Promise.reject(new Error('la administración lee con el actor')),
    withActor: (actor, work) => {
      scopes.push(actor.id);
      return work();
    },
  };
  const reader: ISubscriptionAdministrationReader = {
    planNamesFor: jest.fn().mockResolvedValue(new Map([[ANA, 'Equipo']])),
    clientCountsByPlan: jest.fn().mockResolvedValue([{ planId: TEAM_ID, clientCount: 2 }]),
  };
  return { administration: new SubscriptionAdministration(transactions, reader), scopes, reader };
};

describe('SubscriptionAdministration (spec 009 T-03; arreglos-011 puntos 1 a 4)', () => {
  it('011 CA-1: nombres de plan por cliente, dentro de withActor del administrador', async () => {
    const { administration, scopes, reader } = setup();

    const names = await administration.planNamesFor(ADMIN, [ANA]);

    expect(names.get(ANA)).toBe('Equipo');
    expect(scopes).toEqual([ADMIN.id]);
    expect(reader.planNamesFor).toHaveBeenCalledWith(ADMIN, [ANA]);
  });

  it('sin clientes en la página, no consulta', async () => {
    const { administration, reader } = setup();

    await expect(administration.planNamesFor(ADMIN, [])).resolves.toEqual(new Map());
    expect(reader.planNamesFor).not.toHaveBeenCalled();
  });

  it('011 CA-8, CA-12: clientes por plan, sin parámetro `clientCount` (punto 2)', async () => {
    const { administration, scopes } = setup();

    await expect(administration.clientCountsByPlan(ADMIN)).resolves.toEqual([
      { planId: TEAM_ID, clientCount: 2 },
    ]);
    expect(scopes).toEqual([ADMIN.id]);
  });
});
