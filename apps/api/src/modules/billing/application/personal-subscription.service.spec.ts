import { createActor, Role } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';

import { PersonalSubscriptionService } from './personal-subscription.service';
import type { ISubscriptionRepository } from './ports/i-subscription-repository.port';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);

const setup = () => {
  let actorInScope: Actor | null = null;
  const transactions: ITransactionRunner = {
    run: () => Promise.reject(new Error('el alta Personal no corre sin actor')),
    withActor: async (actor, work) => {
      actorInScope = actor;
      try {
        return await work();
      } finally {
        actorInScope = null;
      }
    },
  };
  const scopes: (Actor | null)[] = [];
  const subscriptions: ISubscriptionRepository = {
    insertPersonalIfAbsent: jest.fn((actor: Actor) => {
      scopes.push(actorInScope === actor ? actor : null);
      return Promise.resolve();
    }),
    lockCurrent: jest.fn(),
    save: jest.fn(),
  };
  const service = new PersonalSubscriptionService(transactions, subscriptions);
  return { service, subscriptions, scopes };
};

describe('PersonalSubscriptionService (spec 009 CA-1)', () => {
  it('CA-1: inserta la suscripción Personal dentro de withActor del cliente dueño', async () => {
    const { service, scopes } = setup();

    await service.subscribe(ANA);

    expect(scopes).toEqual([ANA]);
  });
});
