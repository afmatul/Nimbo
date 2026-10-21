import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { createActor, I_TRANSACTION_RUNNER, Role } from '../../../shared';
import type { ITransactionRunner } from '../../../shared';
import { VerifiedClientLister } from '../../identity';

import type { BillingLogger } from './billing-logger';
import { PersonalSubscriptionService } from './personal-subscription.service';
import { SUBSCRIPTION_RECONCILE_CONFIG } from './subscription-reconcile-config';
import type { SubscriptionReconcileConfig } from './subscription-reconcile-config';

/** Quedaron clientes sin revisar (CA-2): la pasada falla para que BullMQ la reintente. Sin ids ni cifras de cuentas. */
export class SubscriptionReconcileIncompleteError extends Error {
  constructor(readonly failed: number) {
    super(
      `La conciliación de suscripciones dejó ${String(failed)} cuenta(s) sin revisar; se reintentará.`,
    );
    this.name = 'SubscriptionReconcileIncompleteError';
  }
}

/**
 * Conciliación de suscripciones (spec 009 CA-2, PD-40): todo cliente verificado sin suscripción recibe Personal, por si
 * el evento en proceso se perdió. Por páginas de `id`: `VerifiedClientLister` dentro de `ITransactionRunner.run` (sin
 * actor; solo UUID) y, por cliente, `PersonalSubscriptionService.subscribe` como el dueño. Idempotente: repetirla no
 * duplica. El fallo de una cuenta se registra y no frena las demás.
 */
@Injectable()
export class SubscriptionReconcilerService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(VerifiedClientLister) private readonly clients: VerifiedClientLister,
    @Inject(PersonalSubscriptionService) private readonly personal: PersonalSubscriptionService,
    @Inject(SUBSCRIPTION_RECONCILE_CONFIG) private readonly config: SubscriptionReconcileConfig,
    @Inject(PinoLogger) private readonly logger: BillingLogger,
  ) {}

  async reconcileAll(): Promise<void> {
    let scanned = 0;
    let failed = 0;
    let afterId: string | null = null;
    do {
      const ids = await this.nextPage(afterId);
      failed += await this.subscribePage(ids);
      scanned += ids.length;
      afterId = ids.length === this.config.batchSize ? (ids.at(-1) ?? null) : null;
    } while (afterId !== null);
    this.logger.info({ event: 'billing.reconcile_run', scanned, failed });
    if (failed > 0) throw new SubscriptionReconcileIncompleteError(failed);
  }

  private nextPage(afterId: string | null): Promise<readonly string[]> {
    return this.transactions.run(() => this.clients.listIds(afterId, this.config.batchSize));
  }

  /** Cuántas cuentas de la página fallaron. */
  private async subscribePage(ids: readonly string[]): Promise<number> {
    let failed = 0;
    for (const id of ids) {
      if (!(await this.subscribeAsOwner(id))) failed += 1;
    }
    return failed;
  }

  /** `true` si la cuenta quedó con suscripción. El error solo deja su nombre: el mensaje podría traer datos. */
  private async subscribeAsOwner(userId: string): Promise<boolean> {
    try {
      await this.personal.subscribe(createActor(userId, Role.CLIENT));
      return true;
    } catch (error) {
      this.logger.error({
        event: 'billing.reconcile_failed',
        userId,
        errorName: error instanceof Error ? error.name : 'unknown',
      });
      return false;
    }
  }
}
