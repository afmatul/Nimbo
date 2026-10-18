import { Inject, Injectable } from '@nestjs/common';

import { I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';

import { I_SUBSCRIPTION_REPOSITORY } from './ports/i-subscription-repository.port';
import type { ISubscriptionRepository } from './ports/i-subscription-repository.port';

/**
 * Alta de la suscripción Personal (spec 009 CA-1, PD-40). Idempotente: la usan el oyente de la cuenta verificada y la
 * conciliación (T-02). El cobro (T-05) garantiza la fila con el mismo repositorio, dentro de su propia transacción.
 */
@Injectable()
export class PersonalSubscriptionService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
  ) {}

  subscribe(actor: Actor): Promise<void> {
    return this.transactions.withActor(actor, () =>
      this.subscriptions.insertPersonalIfAbsent(actor),
    );
  }
}
